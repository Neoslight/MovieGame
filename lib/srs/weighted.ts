/**
 * Weighted pick over unseen cards.
 *
 * Popularity should *bias* the draw, not decide it. Sorting on it outright made
 * the first twenty cards of a 1900-film deck whatever TMDB happened to be
 * trending — the deck opened on nothing but Spider-Man and Avengers, which is
 * the opposite of what a memory game needs. The square root flattens the scale:
 * TMDB popularity spans roughly 0.5 to 500, so a blockbuster stays about ten
 * times likelier than an obscure short instead of a thousand times, and with a
 * deck this size that lands on a different corner of the collection every draw.
 */
export function pickWeighted<T extends { popularity: number }>(
  items: T[],
  random: () => number = Math.random,
): T | undefined {
  if (items.length === 0) return undefined;

  // The floor keeps a film with popularity 0 — common on shorts and old titles
  // — reachable rather than unplayable.
  const weights = items.map((item) => Math.sqrt(Math.max(item.popularity, 0)) + 0.5);
  const total = weights.reduce((sum, w) => sum + w, 0);

  let ticket = random() * total;
  for (let i = 0; i < items.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return items[i];
  }
  // Floating-point drift only; the last item is as good an answer as any.
  return items[items.length - 1];
}

/**
 * How many of the most overdue cards are treated as equally urgent.
 *
 * Serving them in strict due order made every session identical: the cards
 * answered last time come due within minutes — FSRS learning steps are "1m"
 * and "10m" — so they headed the queue again on the next launch. Nothing
 * within the same window is meaningfully more urgent than anything else, so
 * the pick is random inside it while a genuinely stale card still outranks the
 * rest of the deck.
 */
const DUE_WINDOW = 30;

/** Picks one card from the most overdue ones. `due` must be sorted oldest first. */
export function pickOverdue<T>(due: T[], random: () => number = Math.random): T | undefined {
  if (due.length === 0) return undefined;
  const window = due.slice(0, DUE_WINDOW);
  return window[Math.min(window.length - 1, Math.floor(random() * window.length))];
}
