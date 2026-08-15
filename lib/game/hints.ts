import { Rating, type Grade } from "../srs/scheduler";

/**
 * The hint ladder.
 *
 * A round used to be binary: found, or "Je sèche". But most misses are not
 * blanks — the player knows the film and cannot surface the name. The ladder
 * gives that state somewhere to go: it opens only after three wrong answers,
 * so it never shortcuts a player who is still thinking, and each rung costs
 * something, so a hinted answer never looks like a clean recall to the
 * scheduler.
 */

/** Wrong answers before the ladder is offered at all. */
export const HINTS_AFTER_WRONG = 3;

export const MAX_HINT_LEVEL = 3;

const BULLET = "•";

/** Masks a word, keeping its first `keep` letters and its length. */
function maskWord(word: string, keep: number): string {
  if (word.length <= keep) return word;
  return word.slice(0, keep) + BULLET.repeat(word.length - keep);
}

/**
 * What the player sees at each rung. The scale is tuned so the last rung is
 * still a memory test rather than the answer: on a short surname it stops well
 * before completing it.
 *
 * | level | "Stanley Kubrick"  |
 * |-------|--------------------|
 * | 1     | `S•••••• K••••••`  |
 * | 2     | `Stanley K••••••`  |
 * | 3     | `Stanley Kub••••`  |
 */
export function hintFor(answer: string, level: number): string {
  const words = answer.split(/\s+/).filter(Boolean);
  if (words.length === 0 || level <= 0) return "";

  if (level === 1) return words.map((w) => maskWord(w, 1)).join(" ");

  // From level 2 the leading words are given whole and only the last one — the
  // surname, or the last word of a title — keeps being uncovered.
  const last = words[words.length - 1];
  const head = words.slice(0, -1);
  const keep = level === 2 ? 1 : Math.min(3, Math.max(1, last.length - 2));

  const revealedHead = head.length > 0 ? head : [];
  return [...revealedHead, maskWord(last, keep)].join(" ");
}

/**
 * The year ladder narrows a window instead of uncovering letters: masking the
 * digits of "1980" would either give it away or say nothing.
 */
export function hintForYear(year: number, level: number): string {
  if (level <= 0) return "";
  if (level === 1) {
    const decade = Math.floor(year / 10) * 10;
    return `Années ${decade}`;
  }
  const spread = level === 2 ? 4 : 2;
  // Anchored on the decade rather than the year, so the window does not quietly
  // centre on the answer and hand it over.
  const base = Math.floor(year / spread) * spread;
  return `Entre ${base} et ${base + spread}`;
}

/**
 * The best grade still reachable after taking hints. Applied in `scoreRound`
 * rather than inside `gradeFor`, whose contract is tested on its own and should
 * keep meaning "what the answer itself was worth".
 */
export function maxGradeAfterHints(hintsUsed: number): Grade {
  if (hintsUsed <= 0) return Rating.Easy;
  if (hintsUsed === 1) return Rating.Good;
  return Rating.Hard;
}

/** Caps a grade at what the hints used still allow. */
export function capGrade(grade: Grade, hintsUsed: number): Grade {
  const ceiling = maxGradeAfterHints(hintsUsed);
  return (grade < ceiling ? grade : ceiling) as Grade;
}
