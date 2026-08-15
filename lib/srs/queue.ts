import { db, type Card } from "../db/schema";
import { State } from "./scheduler";
import { pickOverdue, pickWeighted } from "./weighted";
import { CATEGORY_LABELS, type Category, type Film } from "../types";

/** Films to keep out of the next draw, so the same poster never comes twice in a row. */
const RECENT_WINDOW = 10;

/**
 * How long a card rests after being answered before it can head the queue
 * again. FSRS reschedules a fresh card one minute out, which is right inside a
 * study session and wrong across sessions: it made every launch replay the
 * previous one. Long enough to clear an evening, short enough that a film
 * failed today still comes back today.
 */
const REVIEW_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export interface Question {
  card: Card;
  film: Film;
}

export interface QueueOptions {
  categories?: Category[];
  /** Film ids drawn earlier in this session, most recent last. */
  recentFilmIds?: number[];
  /**
   * Restricts the draw to these films. Used by the targeted sessions built from
   * a blind spot, where the point is to drill one set and nothing else — so
   * unlike the other filters this one is never widened when it empties the pool.
   */
  filmIds?: number[];
}

export interface DeckStats {
  total: number;
  due: number;
  fresh: number;
  learning: number;
  mastered: number;
}

export async function deckStats(): Promise<DeckStats> {
  const cards = await db.cards.toArray();
  const now = Date.now();
  return {
    total: cards.length,
    due: cards.filter((c) => new Date(c.due).getTime() <= now).length,
    fresh: cards.filter((c) => c.state === State.New).length,
    // "Mastered" is a display notion: scheduled beyond three weeks out.
    mastered: cards.filter((c) => c.scheduled_days >= 21).length,
    learning: cards.filter((c) => c.state === State.Learning || c.state === State.Relearning)
      .length,
  };
}

export interface CategoryStats {
  total: number;
  due: number;
  fresh: number;
}

/** Per-category counts, so the setup screen can say what each one holds. */
export async function categoryStats(): Promise<Record<Category, CategoryStats>> {
  const cards = await db.cards.toArray();
  const now = Date.now();

  const out = {} as Record<Category, CategoryStats>;
  for (const category of Object.keys(CATEGORY_LABELS) as Category[]) {
    out[category] = { total: 0, due: 0, fresh: 0 };
  }

  for (const card of cards) {
    const bucket = out[card.category];
    if (!bucket) continue;
    bucket.total++;
    if (card.state === State.New) bucket.fresh++;
    else if (new Date(card.due).getTime() <= now) bucket.due++;
  }
  return out;
}

/**
 * Pick the next question: overdue cards first (oldest due date), then an unseen
 * card drawn at random with a popularity bias — enough to favour films worth
 * knowing, not enough to serve the same franchise twenty times running.
 */
export async function nextQuestion({
  categories,
  recentFilmIds = [],
  filmIds,
}: QueueOptions = {}): Promise<Question | null> {
  const now = Date.now();
  const blocked = new Set(recentFilmIds.slice(-RECENT_WINDOW));

  let cards = await db.cards.toArray();
  if (categories?.length) cards = cards.filter((c) => categories.includes(c.category));
  if (filmIds?.length) {
    const wanted = new Set(filmIds);
    cards = cards.filter((c) => wanted.has(c.filmId));
  }
  if (cards.length === 0) return null;

  const pickable = cards.filter((c) => !blocked.has(c.filmId));
  // With a deck smaller than the anti-repeat window, blocking everything would
  // end the session early — fall back to the full set.
  const pool = pickable.length > 0 ? pickable : cards;

  // A card answered a few minutes ago steps aside while there is anything else
  // to play. Without this, the short FSRS learning steps hand back the exact
  // films of the previous session the moment the player taps Jouer again.
  const rested = pool.filter((c) => {
    const last = c.last_review ? new Date(c.last_review).getTime() : 0;
    return now - last > REVIEW_COOLDOWN_MS;
  });
  const candidates = rested.length > 0 ? rested : pool;

  const due = candidates
    .filter((c) => c.state !== State.New && new Date(c.due).getTime() <= now)
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  const chosen =
    // Random among the most overdue rather than strictly the oldest: see
    // pickOverdue for why strict order made every session identical.
    pickOverdue(due) ??
    // Unseen cards are drawn at random, weighted by popularity — see
    // pickWeighted for why a plain sort was wrong.
    pickWeighted(candidates.filter((c) => c.state === State.New)) ??
    // Nothing is due and nothing is new: show the soonest card anyway rather
    // than blocking the player who wants to keep going.
    pool.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())[0];

  if (!chosen) return null;

  const film = await db.films.get(chosen.filmId);
  if (!film) {
    // Orphan card (film deleted): drop it and try again.
    await db.cards.delete(chosen.id!);
    return nextQuestion({ categories, recentFilmIds, filmIds });
  }

  return { card: chosen, film };
}
