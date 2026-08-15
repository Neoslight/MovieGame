import { NextRequest } from "next/server";
import { ndjsonResponse } from "@/lib/ndjson";
import {
  LetterboxdBlockedError,
  LetterboxdStructureError,
  LetterboxdUserNotFoundError,
  normalizeUsername,
  scrapeWatchedFilms,
} from "@/lib/letterboxd/scrape";
import type { LetterboxdFilm } from "@/lib/types";

// node:https is required to get past Letterboxd's bot protection, so this
// route cannot run on the edge runtime.
export const runtime = "nodejs";
// Capped at the free tier's ceiling; see app/api/films/route.ts.
export const maxDuration = 60;

export type ProfileEvent =
  | { type: "progress"; page: number; totalPages: number; films: number }
  | { type: "done"; username: string; films: LetterboxdFilm[] }
  | { type: "error"; code: string; message: string };

/**
 * Streams one event per profile page, then the films. Streaming keeps the
 * connection alive through a scrape that runs deliberately slowly, and lets
 * the UI show which page it is on rather than a frozen bar.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("user");
  if (!raw?.trim()) {
    return Response.json({ error: "Paramètre « user » manquant." }, { status: 400 });
  }
  const username = normalizeUsername(raw);

  return ndjsonResponse<ProfileEvent>(async (send) => {
    try {
      const films = await scrapeWatchedFilms(username, (p) => send({ type: "progress", ...p }));
      send({ type: "done", username, films });
    } catch (error) {
      const known =
        error instanceof LetterboxdUserNotFoundError ||
        error instanceof LetterboxdBlockedError ||
        error instanceof LetterboxdStructureError;
      send({
        type: "error",
        code: known ? error.name : "UnknownError",
        message:
          known && error instanceof Error
            ? error.message
            : "Échec de la récupération du profil Letterboxd.",
      });
    }
  });
}
