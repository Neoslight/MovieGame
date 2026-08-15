import { pickWeighted } from "../srs/weighted";
import { playableCategories, type Category, type Film } from "../types";

/**
 * Arcade: endless, scored, three mistakes and it is over.
 *
 * It deliberately shares nothing with the revision loop but the deck itself.
 * Two rules follow from that, and both matter:
 *
 * 1. **It never writes a card.** Answers given at speed, on films picked for
 *    fun rather than for being due, would rewrite real FSRS due dates and
 *    wreck the schedule the whole app exists to maintain.
 * 2. **It does not use the due queue.** `nextQuestion` is built around urgency
 *    and a four-hour cooldown; an arcade run wants a plain weighted draw, so a
 *    film already revised this morning can still show up tonight.
 *
 * Its reviews are still recorded, tagged `mode: "arcade"`, so the history shows
 * them and the daily streak can leave them out.
 */

export const ARCADE_LIVES = 3;

export interface ArcadeQuestion {
  film: Film;
  category: Category;
}

export interface ArcadeState {
  score: number;
  mistakes: number;
  /** Films already served in this run, most recent last. */
  seen: number[];
}

export const newRun = (): ArcadeState => ({ score: 0, mistakes: 0, seen: [] });

export const isOver = (state: ArcadeState): boolean => state.mistakes >= ARCADE_LIVES;

/** How many films to keep out of the draw so the same poster does not repeat. */
const RECENT_WINDOW = 15;

/**
 * Draws the next film and the angle to ask it from.
 *
 * `films` is passed in rather than read here: a film row carries its whole cast,
 * so re-reading the deck on every draw would deserialise tens of thousands of
 * person records per run. The caller already holds the list.
 *
 * `categories` is the player's session selection: an arcade run should not
 * suddenly ask about composers if that category is switched off.
 */
export function nextArcade(
  films: Film[],
  categories: Category[],
  state: ArcadeState,
  random: () => number = Math.random,
): ArcadeQuestion | null {
  const wanted = new Set(categories);
  const blocked = new Set(state.seen.slice(-RECENT_WINDOW));

  const playable = films
    .map((film) => ({ film, options: playableCategories(film).filter((c) => wanted.has(c)) }))
    .filter((entry) => entry.options.length > 0);

  if (playable.length === 0) return null;

  // With a deck smaller than the anti-repeat window, blocking everything would
  // end the run early — fall back to the full set.
  const fresh = playable.filter((entry) => !blocked.has(entry.film.tmdbId));
  const pool = fresh.length > 0 ? fresh : playable;

  const chosen = pickWeighted(
    pool.map((entry) => ({ ...entry, popularity: entry.film.popularity })),
    random,
  );
  if (!chosen) return null;

  const category = chosen.options[Math.floor(random() * chosen.options.length)];
  return { film: chosen.film, category: category ?? chosen.options[0] };
}
