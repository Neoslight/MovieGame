import { NextRequest } from "next/server";
import { z } from "zod";
import { pooled } from "@/lib/http";
import { ndjsonResponse } from "@/lib/ndjson";
import { FILM_PAGE_PACE, resolveFilmRef, type ResolvedSlug } from "@/lib/letterboxd/scrape";
import { fetchFilm, TmdbAuthError } from "@/lib/tmdb/client";
import { searchConfidentMatch } from "@/lib/tmdb/search";
import { filmRefKey, type Film } from "@/lib/types";

export const runtime = "nodejs";
// 60 s is the ceiling on Vercel's free tier. The worst case below is ~36 s, so
// this still covers a batch where every single film falls back to Letterboxd.
export const maxDuration = 60;

/**
 * A typical batch resolves almost entirely through TMDB search and takes a
 * couple of seconds; the size is set by the worst case, where every film falls
 * back to Letterboxd and 40 films take ~36 s — still inside a serverless
 * timeout.
 */
const BATCH_LIMIT = 40;

const Body = z.object({
  films: z
    .array(
      z.object({
        slug: z.string().min(1).nullable(),
        shortUrl: z.string().url().optional(),
        title: z.string(),
        year: z.number().nullable(),
      }),
    )
    .min(1)
    .max(BATCH_LIMIT),
});

export type FilmsEvent =
  /** A film has been located; `via` says which path settled it. */
  | { type: "located"; title: string; via: "search" | "letterboxd" }
  /** A film is fully enriched and ready to store. */
  | { type: "film"; film: Film }
  /**
   * Settled: this film will never resolve — no TMDB id, or a TV series. Stored
   * in `unresolved` so the import count reconciles and we stop retrying it.
   */
  | { type: "skipped"; slug: string; title: string; year: number | null; reason: string }
  /**
   * Not settled: TMDB was unreachable or errored. Deliberately distinct from
   * `skipped` — a transient outage must not blacklist a film forever, so this
   * is never written to `unresolved` and the film is simply retried next time.
   */
  | { type: "fetch-failed"; title: string; reason: string }
  | { type: "error"; message: string; code: string };

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: `Corps invalide (max ${BATCH_LIMIT} films par lot).` },
      { status: 400 },
    );
  }
  const input = parsed.data.films;

  return ndjsonResponse<FilmsEvent>(async (send) => {
    const skip = (source: (typeof input)[number], reason: string) =>
      send({
        type: "skipped",
        slug: filmRefKey(source),
        title: source.title,
        year: source.year,
        reason,
      });

    try {
      // Step 1a — TMDB search first. It costs nothing in rate limit and settles
      // ~90 % of films: measured on a 1964-film archive, that share matches a
      // single title in a single year, leaving nothing to guess.
      const searched = await pooled(
        input,
        async (film) => {
          const match = await searchConfidentMatch(film);
          if (match) send({ type: "located", title: film.title, via: "search" });
          return match;
        },
        { concurrency: 10, delayMs: 0 },
      );

      // Step 1b — everything ambiguous goes to Letterboxd, whose film page
      // carries the exact id. This is the slow path, so it stays the minority.
      const doubtful = input
        .map((film, index) => ({ film, index }))
        .filter(({ index }) => !searched[index]);

      const fallback = await pooled(
        doubtful,
        async ({ film }) => {
          const resolved = await resolveFilmRef(film);
          send({ type: "located", title: film.title, via: "letterboxd" });
          return resolved;
        },
        FILM_PAGE_PACE,
      );

      const resolutions: (ResolvedSlug | null)[] = input.map((film, index) => {
        const hit = searched[index];
        return hit ? { slug: film.slug ?? filmRefKey(film), ...hit } : null;
      });
      doubtful.forEach(({ index }, i) => {
        resolutions[index] = fallback[i];
      });

      // Step 2 — one TMDB call per film. TMDB allows ~40 req/s, so this runs
      // wide; it is not the bottleneck.
      await pooled(
        input,
        async (source, index) => {
          const resolution = resolutions[index];
          if (!resolution) {
            skip(source, "Aucun identifiant TMDB trouvé");
            return;
          }
          if (resolution.tmdbType !== "movie") {
            // Series are logged on Letterboxd but "the director" of a
            // mini-series is not a well-defined answer.
            skip(source, "Série télé, hors périmètre du jeu");
            return;
          }
          try {
            // The slug comes from the resolver: for a short link it is only
            // known after following the redirect.
            send({ type: "film", film: await fetchFilm(resolution.tmdbId, resolution.slug) });
          } catch (error) {
            if (error instanceof TmdbAuthError) throw error;
            // The film resolved to a real TMDB id and only the fetch failed, so
            // nothing about it is settled: report it as a failure to retry,
            // never as a skip.
            send({
              type: "fetch-failed",
              title: source.title,
              reason: error instanceof Error ? error.message : "Échec TMDB",
            });
          }
        },
        { concurrency: 8, delayMs: 0 },
      );
    } catch (error) {
      send({
        type: "error",
        code: error instanceof TmdbAuthError ? "TmdbAuthError" : "BatchError",
        message: error instanceof Error ? error.message : "Échec du lot.",
      });
    }
  });
}
