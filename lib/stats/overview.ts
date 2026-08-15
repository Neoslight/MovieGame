import type { Review } from "../db/schema";
import { State } from "../srs/scheduler";
import type { Card } from "../db/schema";
import type { Film } from "../types";

/**
 * Aggregations behind the bonus screens. Pure functions over rows already in
 * IndexedDB — no fetching, and testable without a browser.
 */

export interface Tally {
  name: string;
  count: number;
}

/** Directors you have seen most, which on a personal deck is a portrait. */
export function topDirectors(films: Film[], limit = 10): Tally[] {
  const counts = new Map<string, number>();
  for (const film of films) {
    // A co-directed film counts for both, which is what "seen most" means here.
    for (const person of film.directors) {
      counts.set(person.name, (counts.get(person.name) ?? 0) + 1);
    }
  }
  return rank(counts, limit);
}

export function topActors(films: Film[], limit = 10): Tally[] {
  const counts = new Map<string, number>();
  for (const film of films) {
    // Billing only: the thirtieth name on a cast list says nothing about taste.
    for (const person of film.cast.slice(0, 5)) {
      counts.set(person.name, (counts.get(person.name) ?? 0) + 1);
    }
  }
  return rank(counts, limit);
}

export interface DecadeTally {
  decade: number;
  count: number;
}

export function byDecade(films: Film[]): DecadeTally[] {
  const counts = new Map<number, number>();
  for (const film of films) {
    if (film.year === null) continue;
    const decade = Math.floor(film.year / 10) * 10;
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => a.decade - b.decade);
}

function rank(counts: Map<string, number>, limit: number): Tally[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .filter((t) => t.count > 1)
    // Ties broken alphabetically so the list does not reshuffle between renders.
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * A blind spot needs evidence. One wrong answer is a bad evening, not a gap, so
 * nothing below `MIN_REVIEWS` is ever called out — the whole point is to be
 * believed when it does say something.
 */
export const MIN_REVIEWS = 2;
export const WEAK_THRESHOLD = 0.5;

export interface WeakSpot {
  name: string;
  asked: number;
  missed: number;
  /** Films behind this weak spot, so a session can be built from it. */
  filmIds: number[];
}

/**
 * Directors the player systematically fails to name. Reviews carry the film id
 * but not the director, so this joins against the deck in memory — a couple of
 * thousand rows, well within what a phone does without noticing.
 */
export function weakDirectors(reviews: Review[], films: Film[], limit = 8): WeakSpot[] {
  const byId = new Map(films.map((film) => [film.tmdbId, film]));
  const stats = new Map<string, { asked: number; missed: number; filmIds: Set<number> }>();

  for (const review of reviews) {
    // Arcade answers are played for speed and would slander a director unfairly.
    if (review.mode === "arcade") continue;
    const film = byId.get(review.filmId);
    if (!film) continue;

    for (const person of film.directors) {
      const entry = stats.get(person.name) ?? { asked: 0, missed: 0, filmIds: new Set() };
      entry.asked++;
      if (!review.correct) {
        entry.missed++;
        entry.filmIds.add(film.tmdbId);
      }
      stats.set(person.name, entry);
    }
  }

  return [...stats.entries()]
    .filter(([, s]) => s.asked >= MIN_REVIEWS && s.missed / s.asked > WEAK_THRESHOLD)
    .map(([name, s]) => ({
      name,
      asked: s.asked,
      missed: s.missed,
      filmIds: [...s.filmIds],
    }))
    .sort((a, b) => b.missed / b.asked - a.missed / a.asked || b.missed - a.missed)
    .slice(0, limit);
}

/**
 * Films the deck says you have genuinely lost: forgotten repeatedly, or back in
 * relearning. `reps > 0` is load-bearing — a card never played is not a film
 * you have forgotten, it is one the game has not asked about yet.
 */
export const FORGOTTEN_LAPSES = 2;

export function forgotten(cards: Card[], films: Film[], limit = 12): Film[] {
  const byId = new Map(films.map((film) => [film.tmdbId, film]));
  const scored = new Map<number, number>();

  for (const card of cards) {
    if (card.reps === 0) continue;
    const lost = card.lapses >= FORGOTTEN_LAPSES || card.state === State.Relearning;
    if (!lost) continue;
    scored.set(card.filmId, Math.max(scored.get(card.filmId) ?? 0, card.lapses));
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([filmId]) => byId.get(filmId))
    .filter((film): film is Film => film !== undefined)
    .slice(0, limit);
}

/**
 * Consecutive days with at least one revision, counting back from today.
 * Arcade rounds are excluded on purpose: the streak measures revision, and
 * letting a fast arcade run keep it alive would make it mean nothing.
 */
export function currentStreak(reviews: Review[], now = new Date()): number {
  const days = new Set<string>();
  for (const review of reviews) {
    if (review.mode === "arcade") continue;
    days.add(dayKey(new Date(review.ts)));
  }
  if (days.size === 0) return 0;

  // Today not being played yet must not break a streak that is still alive, so
  // counting starts at yesterday when nothing has been answered today.
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Local calendar day: a session at 1 a.m. belongs to the night it started. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
