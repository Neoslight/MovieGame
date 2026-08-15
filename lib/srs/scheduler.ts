import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";

/**
 * FSRS rather than a hand-rolled SM-2: it models memory stability directly, so
 * a film answered right several times drifts from days to weeks to months on
 * its own, which is the whole point of the deck.
 */
const scheduler = fsrs(
  generatorParameters({
    enable_fuzz: true, // spreads due dates so the same films don't clump
    maximum_interval: 365,
    // Short relearning steps: a forgotten film should come back this session.
    learning_steps: ["1m", "10m"],
    relearning_steps: ["5m"],
  }),
);

export { Rating, State };
export type { FsrsCard, Grade };

export const newCardState = (): FsrsCard => createEmptyCard(new Date());

export interface AnswerSignal {
  correct: boolean;
  /** Edit distance of the accepted answer; 0 when typed perfectly. */
  distance: number;
  elapsedMs: number;
  /** The player asked to see the answer instead of trying. */
  revealed?: boolean;
}

const FAST_ANSWER_MS = 4_000;
const SLOW_ANSWER_MS = 12_000;

/**
 * Turn "what the player typed and how fast" into an FSRS grade. Hesitation and
 * near-misses are real recall signals, so they land on Hard rather than Good —
 * that keeps the film in rotation without punishing a typo like a blank.
 */
export function gradeFor({ correct, distance, elapsedMs, revealed }: AnswerSignal): Grade {
  if (revealed || !correct) return Rating.Again;
  if (elapsedMs > SLOW_ANSWER_MS || distance >= 2) return Rating.Hard;
  if (elapsedMs < FAST_ANSWER_MS && distance === 0) return Rating.Easy;
  return Rating.Good;
}

export function review(card: FsrsCard, grade: Grade, now = new Date()): FsrsCard {
  return scheduler.next(card, now, grade).card;
}

/** Human-readable delay until the next review — "dans 3 semaines". */
export function formatInterval(due: Date, from = new Date()): string {
  const minutes = Math.round((due.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return "tout de suite";
  if (minutes < 60) return `dans ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `dans ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `dans ${days} j`;
  if (days < 30) return `dans ${Math.round(days / 7)} sem.`;
  if (days < 365) return `dans ${Math.round(days / 30)} mois`;
  return `dans ${(days / 365).toFixed(1)} an(s)`;
}
