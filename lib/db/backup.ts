import { z } from "zod";
import type { Card, Review, Setting } from "./schema";
import type { Film } from "../types";

/**
 * Shape check for a restored export.
 *
 * The danger is not the unreadable file — `JSON.parse` throws before anything
 * is touched. It is the file that parses cleanly and *isn't a backup*: the
 * restore clears films, cards and reviews first, so an unvalidated payload
 * destroys a working deck and then commits whatever it was given. Everything
 * here runs before the first `clear()`.
 */

const person = z.object({
  tmdbId: z.number(),
  name: z.string(),
  profilePath: z.string().nullable(),
  aliases: z.array(z.string()).default([]),
});

const film = z
  .object({
    tmdbId: z.number(),
    slug: z.string(),
    title: z.string(),
    originalTitle: z.string(),
    year: z.number().nullable(),
    posterPath: z.string().nullable(),
    popularity: z.number(),
    voteCount: z.number().optional(),
    directors: z.array(person),
    cast: z.array(person),
    cinematographers: z.array(person).default([]),
    composers: z.array(person).default([]),
    addedAt: z.number(),
  })
  // Unknown keys survive: a backup written by a later version must not be
  // rejected here, and must not be silently stripped of its new fields.
  .loose();

/**
 * FSRS keeps its dates as `Date`. JSON turns them into strings, so a restored
 * card used to differ from a live one; coercing puts them back.
 */
const card = z
  .object({
    id: z.number().optional(),
    filmId: z.number(),
    category: z.string(),
    popularity: z.number(),
    due: z.coerce.date(),
    stability: z.number(),
    difficulty: z.number(),
    elapsed_days: z.number(),
    scheduled_days: z.number(),
    reps: z.number(),
    lapses: z.number(),
    state: z.number(),
    last_review: z.coerce.date().optional(),
  })
  .loose();

const review = z
  .object({
    id: z.number().optional(),
    cardId: z.number().nullable(),
    filmId: z.number(),
    category: z.string(),
    ts: z.number(),
    correct: z.boolean(),
    rating: z.number(),
    userAnswer: z.string(),
    expected: z.string(),
    distance: z.number(),
    durationMs: z.number(),
    // Absent from every backup written before arcade mode existed.
    mode: z.enum(["srs", "arcade"]).default("srs"),
    hintsUsed: z.number().optional(),
    filmTitle: z.string(),
    posterPath: z.string().nullable(),
  })
  .loose();

const setting = z.object({ key: z.string(), value: z.unknown() });

const backup = z.object({
  films: z.array(film).default([]),
  cards: z.array(card).default([]),
  reviews: z.array(review).default([]),
  settings: z.array(setting).default([]),
});

export interface Backup {
  films: Film[];
  cards: Card[];
  reviews: Review[];
  settings: Setting[];
}

export class BackupFormatError extends Error {
  constructor(detail: string) {
    super(`Sauvegarde non reconnue : ${detail}`);
    this.name = "BackupFormatError";
  }
}

/** Throws `BackupFormatError` rather than returning a half-valid deck. */
export function parseBackup(raw: unknown): Backup {
  const parsed = backup.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BackupFormatError(
      issue ? `${issue.path.join(".") || "racine"} — ${issue.message}` : "structure invalide",
    );
  }

  // An export with no film at all is far more likely to be the wrong file than
  // a genuine empty deck, and restoring it would wipe the real one.
  if (parsed.data.films.length === 0 && parsed.data.cards.length === 0) {
    throw new BackupFormatError("aucun film ni carte dans le fichier");
  }

  return parsed.data as unknown as Backup;
}
