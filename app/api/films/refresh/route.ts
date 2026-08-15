import { NextRequest } from "next/server";
import { z } from "zod";
import { pooled } from "@/lib/http";
import { ndjsonResponse } from "@/lib/ndjson";
import { fetchFilm, TmdbAuthError } from "@/lib/tmdb/client";
import type { Film } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const BATCH_LIMIT = 60;

const Body = z.object({
  films: z
    .array(z.object({ tmdbId: z.number().int().positive(), slug: z.string() }))
    .min(1)
    .max(BATCH_LIMIT),
});

export type RefreshEvent =
  | { type: "film"; film: Film }
  | { type: "failed"; tmdbId: number }
  | { type: "error"; message: string; code: string };

/**
 * Re-fetches films already in the deck straight from TMDB by id. Nothing to
 * resolve — no Letterboxd, no search — so this is pure TMDB throughput, and
 * the client keeps its cards and review history because the primary key does
 * not move.
 */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: `Corps invalide (max ${BATCH_LIMIT} films par lot).` },
      { status: 400 },
    );
  }

  return ndjsonResponse<RefreshEvent>(async (send) => {
    try {
      await pooled(
        parsed.data.films,
        async ({ tmdbId, slug }) => {
          try {
            send({ type: "film", film: await fetchFilm(tmdbId, slug) });
          } catch (error) {
            if (error instanceof TmdbAuthError) throw error;
            // One dead id must not sink the batch: the old row simply stays.
            send({ type: "failed", tmdbId });
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
