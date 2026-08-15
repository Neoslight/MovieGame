import type { Film, Person } from "../types";

const API = "https://api.themoviedb.org/3";

export class TmdbAuthError extends Error {
  constructor(detail = "manquante ou invalide") {
    super(
      `Clé TMDB ${detail}. Renseigne TMDB_READ_TOKEN dans .env.local (themoviedb.org → Paramètres → API) : la clé v3 comme le jeton v4 fonctionnent.`,
    );
    this.name = "TmdbAuthError";
  }
}

/**
 * TMDB hands out two credentials: a 32-char v3 key that goes in the query
 * string, and a long v4 JWT that goes in an Authorization header. Accept
 * whichever the user pasted rather than making them hunt for the other one.
 */
function credentials(token: string): { header?: string; query?: string } {
  return token.includes(".") ? { header: `Bearer ${token}` } : { query: token };
}

/**
 * TMDB has no bot protection and allows ~40 req/s, so the plain fetch is fine
 * here — unlike Letterboxd, which needs the node:https client in lib/http.
 */
export async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const token = process.env.TMDB_READ_TOKEN?.trim();
  if (!token) throw new TmdbAuthError("manquante");
  const auth = credentials(token);

  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (auth.query) url.searchParams.set("api_key", auth.query);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(auth.header ? { Authorization: auth.header } : {}),
      },
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401) throw new TmdbAuthError("refusée par TMDB");
    if (res.status === 404) throw new Error(`TMDB 404 sur ${path}`);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (res.status < 500) throw new Error(`TMDB ${res.status} sur ${path}`);
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  throw new Error(`TMDB injoignable sur ${path}`);
}

interface RawPerson {
  id: number;
  name: string;
  profile_path: string | null;
  job?: string;
  order?: number;
}

interface RawMovie {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  popularity: number;
  vote_count: number;
  credits: { cast: RawPerson[]; crew: RawPerson[] };
}

function toPerson(raw: RawPerson): Person {
  return { tmdbId: raw.id, name: raw.name, profilePath: raw.profile_path, aliases: [] };
}

/** Deduplicates by person id — TMDB lists people twice when they hold two jobs. */
function byJob(crew: RawPerson[], job: string): Person[] {
  const seen = new Set<number>();
  return crew
    .filter((c) => c.job === job)
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .map(toPerson);
}

/**
 * Deep enough that a name the player actually remembers is likely to be in
 * here. Only the first few are ever *asked* for, but any of the thirty counts
 * as a right answer — with five, remembering a supporting actor was punished
 * as a wrong answer, which is the opposite of what the game should teach.
 */
const MAX_CAST = 30;

export async function fetchFilm(tmdbId: number, slug: string): Promise<Film> {
  // append_to_response folds credits into the same request instead of two.
  const raw = await tmdbGet<RawMovie>(`/movie/${tmdbId}`, {
    append_to_response: "credits",
    language: "fr-FR",
  });

  const cast = [...raw.credits.cast]
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .filter((c) => c.profile_path)
    .slice(0, MAX_CAST)
    .map(toPerson);

  const year = raw.release_date ? Number(raw.release_date.slice(0, 4)) : null;

  return {
    tmdbId: raw.id,
    slug,
    title: raw.title,
    originalTitle: raw.original_title,
    year: Number.isFinite(year) ? year : null,
    posterPath: raw.poster_path,
    popularity: raw.popularity ?? 0,
    voteCount: raw.vote_count ?? 0,
    directors: byJob(raw.credits.crew, "Director"),
    cast,
    // Stored now so the cinematographer/composer categories can ship later
    // without re-fetching two thousand films.
    cinematographers: byJob(raw.credits.crew, "Director of Photography"),
    composers: byJob(raw.credits.crew, "Original Music Composer"),
    addedAt: Date.now(),
  };
}

/** Alternate spellings TMDB knows about — feeds the answer matcher. */
export async function fetchAliases(personId: number): Promise<string[]> {
  const raw = await tmdbGet<{ also_known_as?: string[] }>(`/person/${personId}`);
  return raw.also_known_as ?? [];
}

export { posterUrl, profileUrl } from "./images";
