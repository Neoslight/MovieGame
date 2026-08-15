import * as cheerio from "cheerio";
import { fetchPage, fetchText, HttpError, pooled } from "../http";
import { filmRefKey, type LetterboxdFilm } from "../types";

const BASE = "https://letterboxd.com";

/**
 * Letterboxd has no public API (access is request-only via api@letterboxd.com),
 * so we parse the public profile HTML. Every selector here is load-bearing:
 * if the markup changes we throw loudly rather than silently return nothing,
 * because a silent empty list would look like "this user has no films".
 */
export class LetterboxdStructureError extends Error {
  constructor(detail: string) {
    super(
      `Structure Letterboxd modifiée : ${detail}. Utilise l'import par fichier CSV en attendant une mise à jour du parseur.`,
    );
    this.name = "LetterboxdStructureError";
  }
}

export class LetterboxdBlockedError extends Error {
  constructor() {
    super(
      "Letterboxd limite temporairement les lectures de profil. Réessaie dans cinq minutes, ou importe le fichier CSV de ton export pour ne pas attendre.",
    );
    this.name = "LetterboxdBlockedError";
  }
}

export class LetterboxdUserNotFoundError extends Error {
  constructor(username: string) {
    super(`Profil Letterboxd introuvable : « ${username} ».`);
    this.name = "LetterboxdUserNotFoundError";
  }
}

export { normalizeUsername } from "./username";

function parsePosterGrid(html: string): LetterboxdFilm[] {
  const $ = cheerio.load(html);
  const films: LetterboxdFilm[] = [];

  $('[data-component-class="LazyPoster"]').each((_, el) => {
    const slug = $(el).attr("data-item-slug");
    if (!slug) return;
    const display =
      $(el).attr("data-item-full-display-name") ?? $(el).attr("data-item-name") ?? "";
    // "Misty Green (2026)" -> title + year. Films with no release year keep null.
    const match = display.match(/^(.*)\s+\((\d{4})\)\s*$/);
    films.push(
      match
        ? { slug, title: match[1], year: Number(match[2]) }
        : { slug, title: display || slug, year: null },
    );
  });

  return films;
}

function parsePageCount(html: string): number {
  const $ = cheerio.load(html);
  const pages = $(".paginate-pages li")
    .map((_, el) => Number($(el).text().trim()))
    .get()
    .filter((n) => Number.isFinite(n) && n > 0);
  return pages.length > 0 ? Math.max(...pages) : 1;
}

/**
 * Measured rate limits (live, 2026-08): the member-profile section blocks for
 * 5+ minutes once tripped, so it gets a slow sequential pace — it is only ~28
 * pages. The /film/ section tolerates ~3 req/s sustained (49/50 over 31s),
 * which is what makes resolving a couple thousand slugs practical.
 */
const PROFILE_PACE = { concurrency: 1, delayMs: 1200 };
export const FILM_PAGE_PACE = { concurrency: 1, delayMs: 320 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchProfilePage(
  username: string,
  page: number,
  allowBackoff = true,
): Promise<string> {
  const url =
    page === 1
      ? `${BASE}/${username}/films/`
      : `${BASE}/${username}/films/page/${page}/`;
  try {
    const html = await fetchText(url);
    // Cloudflare returns 200 with an interstitial rather than an error status.
    if (html.includes("<title>Just a moment...</title>")) throw new LetterboxdBlockedError();
    return html;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      throw new LetterboxdUserNotFoundError(username);
    }
    const blocked =
      err instanceof LetterboxdBlockedError ||
      (err instanceof HttpError && (err.status === 403 || err.status === 503));
    if (blocked) {
      // The block lifts on its own after a few minutes. One long wait is worth
      // trying before we send the user off to the CSV route.
      if (allowBackoff) {
        await sleep(75_000);
        return fetchProfilePage(username, page, false);
      }
      throw new LetterboxdBlockedError();
    }
    throw err;
  }
}

export interface ScrapeProgress {
  page: number;
  totalPages: number;
  films: number;
}

/** Scrape every watched film from a public profile. ~72 films per page. */
export async function scrapeWatchedFilms(
  username: string,
  onProgress?: (p: ScrapeProgress) => void,
): Promise<LetterboxdFilm[]> {
  const firstHtml = await fetchProfilePage(username, 1);
  const totalPages = parsePageCount(firstHtml);
  const firstPage = parsePosterGrid(firstHtml);

  if (firstPage.length === 0) {
    // An empty first page is only legitimate when the profile really is empty.
    // A logged-films count in the markup proves the parser is at fault instead.
    const hasFilmsElsewhere = /\/films\/page\/2\//.test(firstHtml);
    if (hasFilmsElsewhere) throw new LetterboxdStructureError("aucune affiche trouvée sur la page 1");
    return [];
  }

  const all = [...firstPage];
  onProgress?.({ page: 1, totalPages, films: all.length });

  const rest = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  let done = 1;
  const pages = await pooled(
    rest,
    async (page) => {
      const films = parsePosterGrid(await fetchProfilePage(username, page));
      done++;
      onProgress?.({ page: done, totalPages, films: all.length + films.length });
      return films;
    },
    PROFILE_PACE,
  );

  for (const page of pages) all.push(...page);

  // Letterboxd can serve the same film twice across page boundaries when the
  // profile is written to mid-scrape.
  const seen = new Set<string>();
  return all.filter((f) => {
    const key = filmRefKey(f);
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

export interface ResolvedSlug {
  slug: string;
  tmdbId: number;
  tmdbType: "movie" | "tv";
}

/**
 * Resolves either form of reference: a slug from a profile grid, or the
 * boxd.it short link that CSV exports use (which redirects to the film page,
 * so the slug comes back with the same request).
 */
export async function resolveFilmRef(film: LetterboxdFilm): Promise<ResolvedSlug | null> {
  const url = film.slug ? `${BASE}/film/${film.slug}/` : film.shortUrl;
  if (!url) return null;

  let page: { body: string; url: string };
  try {
    page = await fetchPage(url);
  } catch {
    return null;
  }

  const slug = page.url.match(/letterboxd\.com\/film\/([^/?#]+)/i)?.[1] ?? film.slug;
  if (!slug) return null;

  const ids = readTmdbIds(page.body);
  return ids ? { slug, ...ids } : null;
}

function readTmdbIds(html: string): { tmdbId: number; tmdbType: "movie" | "tv" } | null {
  const attrId = html.match(/tmdb-id="(\d+)"/);
  if (attrId) {
    const type = html.match(/tmdb-type="(movie|tv)"/);
    return { tmdbId: Number(attrId[1]), tmdbType: (type?.[1] as "movie" | "tv") ?? "movie" };
  }
  // TV entries ship an empty tmdb-id and only expose the id via the outbound link.
  const link = html.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
  return link ? { tmdbId: Number(link[2]), tmdbType: link[1] as "movie" | "tv" } : null;
}

/**
 * The film page carries `tmdb-id="496243"` — an exact identifier, which beats
 * guessing from title+year (remakes, re-releases, translated titles all collide).
 */
export const resolveSlugToTmdb = (slug: string) =>
  resolveFilmRef({ slug, title: slug, year: null });
