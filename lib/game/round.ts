import { matchAnswer, type MatchResult } from "../matching/fuzzy";
import { capGrade } from "./hints";
import { gradeFor, Rating, type Grade } from "../srs/scheduler";
import {
  CATEGORY_CREDIT,
  isMultiName,
  isPeopleCategory,
  type Category,
  type Film,
  type Person,
} from "../types";

export const MAX_ACTORS_TO_FIND = 4;

/**
 * Every credited actor with a photo is a right answer, not just the top
 * billing: remembering the fourth name on the poster is real recall and should
 * count as one.
 */
export function acceptedCast(film: Film): Person[] {
  return film.cast.filter((p) => p.profilePath);
}

/**
 * Vote count, not `popularity`. TMDB's popularity is a rolling seven-day
 * trend — it says a film is being clicked on this week, not that it is worth
 * knowing. Vote count is the all-time proxy: how many people ever rated it.
 * A blockbuster is worth four names, a forgotten short one.
 */
const VOTE_TIERS: readonly [votes: number, actors: number][] = [
  [8000, MAX_ACTORS_TO_FIND],
  [2000, 3],
  [300, 2],
];

export function actorsToFind(film: Film): number {
  const votes = film.voteCount ?? 0;
  const tier = VOTE_TIERS.find(([threshold]) => votes >= threshold)?.[1] ?? 1;
  // Never ask for more names than the film actually credits.
  return Math.max(1, Math.min(tier, acceptedCast(film).length));
}

/**
 * How many answers close the round. One name is always enough on a crew
 * question: the question is who made the film, and someone who answers "Coen"
 * or "Daniels" has remembered it — demanding both names tests spelling, not
 * memory. The reveal still shows every credited name.
 */
export function requiredFor(film: Film, category: Category): number {
  return isMultiName(category) ? actorsToFind(film) : 1;
}

export function targetsFor(film: Film, category: Category): Person[] {
  if (category === "actors") return acceptedCast(film);
  // A film-shaped question has no person to find; the caller matches a title or
  // a year instead.
  if (!isPeopleCategory(category)) return [];
  return film[CATEGORY_CREDIT[category]];
}

/**
 * The faces shown as the clue when the film itself is the answer. Deliberately
 * the top billing only — a wall of thirty would give the film away by sheer
 * recognisability, and the question is meant to be hard.
 */
export const CAST_CLUE_SIZE = 4;

export function castClue(film: Film): Person[] {
  return acceptedCast(film).slice(0, CAST_CLUE_SIZE);
}

/**
 * How far off a year can be and still count.
 *
 * Placing a film to the year is a different skill from naming its director, and
 * demanding the exact one would make the category a coin toss on everything
 * before 1980. One year either side is a right answer; up to three is recall
 * worth keeping in rotation, capped at Hard; beyond that the film is not placed.
 */
export const YEAR_EXACT = 1;
export const YEAR_CLOSE = 3;

export function scoreYear({
  guess,
  actual,
  elapsedMs,
  revealed,
  hintsUsed = 0,
}: {
  guess: number;
  actual: number;
  elapsedMs: number;
  revealed: boolean;
  hintsUsed?: number;
}): RoundOutcome {
  const distance = Math.abs(guess - actual);
  if (revealed || distance > YEAR_CLOSE) {
    return { grade: Rating.Again, correct: false, distance };
  }
  if (distance > YEAR_EXACT) {
    return { grade: capGrade(Rating.Hard, hintsUsed), correct: true, distance };
  }
  // Within a year: hand back to the usual grader so answering instantly still
  // reads as Easy, but without letting the year gap stand in for a typo count.
  return {
    grade: capGrade(gradeFor({ correct: true, distance: 0, elapsedMs }), hintsUsed),
    correct: true,
    distance,
  };
}

/**
 * The reveal shows the top billing — the full thirty would be a phone book —
 * plus anyone the player named from further down, who has earned their place.
 */
export function castToReveal(film: Film, found: Person[], required: number): Person[] {
  const billed = acceptedCast(film).slice(0, Math.max(required, 5));
  const extra = found.filter((p) => !billed.some((b) => b.tmdbId === p.tmdbId));
  return [...billed, ...extra];
}

export function promptFor(category: Category, required: number): string {
  switch (category) {
    case "director":
      return "Qui a réalisé ce film ?";
    case "cinematographer":
      return "Qui a fait l'image ?";
    case "composer":
      return "Qui a composé la musique ?";
    case "actors":
      return required === 1 ? "Cite un acteur du film" : `Cite ${required} acteurs du film`;
    case "title-cast":
      return "De quel film sont-ils ?";
    case "title-poster":
      return "Quel film ?";
    case "year":
      return "En quelle année ?";
  }
}

/**
 * Checks one submission against the targets still to find, ignoring people the
 * player already named so a repeat isn't scored as a fresh hit.
 */
export function checkSubmission(
  input: string,
  remaining: Person[],
  corpus: Person[],
): MatchResult {
  return matchAnswer(input, remaining, { corpus });
}

export interface RoundOutcome {
  grade: Grade;
  correct: boolean;
  distance: number;
}

/**
 * Score the round. The director round is pass/fail; the actors round is graded
 * on how many of the names asked for came back, because two out of four is real
 * partial recall and shouldn't reset the card the way a blank does.
 */
export function scoreRound({
  category,
  foundCount,
  required,
  worstDistance,
  elapsedMs,
  revealed,
  hintsUsed = 0,
}: {
  category: Category;
  foundCount: number;
  required: number;
  worstDistance: number;
  elapsedMs: number;
  revealed: boolean;
  /** Rungs of the hint ladder taken; caps the grade without changing the answer. */
  hintsUsed?: number;
}): RoundOutcome {
  if (revealed || foundCount === 0) {
    return { grade: Rating.Again, correct: false, distance: worstDistance };
  }

  if (isMultiName(category) && foundCount < required) {
    // Half the names or better keeps the card moving; less than that repeats it.
    const grade = foundCount * 2 >= required ? Rating.Hard : Rating.Again;
    return { grade, correct: false, distance: worstDistance };
  }

  return {
    grade: capGrade(
      gradeFor({ correct: true, distance: worstDistance, elapsedMs }),
      hintsUsed,
    ),
    correct: true,
    distance: worstDistance,
  };
}
