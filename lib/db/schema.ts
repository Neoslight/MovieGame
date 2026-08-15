import Dexie, { type EntityTable } from "dexie";
import type { Category, Film } from "../types";
import type { FsrsCard } from "../srs/scheduler";

/** One card = one film seen through one category. */
export interface Card extends FsrsCard {
  id?: number;
  filmId: number;
  category: Category;
  /** Denormalised so the due-queue never has to join against films. */
  popularity: number;
}

/**
 * Which loop produced a review. Only "srs" answers moved a card's schedule;
 * arcade rounds are played off the deck and must never count as revision — the
 * daily streak and every progress figure filter on this.
 */
export type PlayMode = "srs" | "arcade";

export interface Review {
  id?: number;
  /** Null in arcade, which draws films rather than cards. */
  cardId: number | null;
  filmId: number;
  category: Category;
  ts: number;
  correct: boolean;
  rating: number;
  userAnswer: string;
  expected: string;
  distance: number;
  durationMs: number;
  mode: PlayMode;
  /** How far up the hint ladder the player went; absent on pre-V2 rows. */
  hintsUsed?: number;
  /** So history reads without loading the whole film row. */
  filmTitle: string;
  posterPath: string | null;
}

export interface Setting {
  key: string;
  value: unknown;
}

/** A film we could not attach to TMDB — kept so the import count reconciles. */
export interface UnresolvedFilm {
  slug: string;
  title: string;
  year: number | null;
  reason: string;
}

const db = new Dexie("moviegame") as Dexie & {
  films: EntityTable<Film, "tmdbId">;
  cards: EntityTable<Card, "id">;
  reviews: EntityTable<Review, "id">;
  settings: EntityTable<Setting, "key">;
  unresolved: EntityTable<UnresolvedFilm, "slug">;
};

db.version(1).stores({
  films: "tmdbId, slug, title, year, popularity",
  cards: "++id, filmId, category, due, state, [filmId+category]",
  reviews: "++id, cardId, filmId, ts",
  settings: "key",
  unresolved: "slug",
});

/**
 * v2 adds the play mode. Every review written before arcade existed was a
 * revision by definition, so the backfill is unconditional — without it the
 * streak would silently drop the whole history.
 */
db.version(2)
  .stores({ reviews: "++id, cardId, filmId, ts, mode" })
  .upgrade((tx) =>
    tx
      .table("reviews")
      .toCollection()
      .modify((review) => {
        review.mode = "srs";
      }),
  );

export { db };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
