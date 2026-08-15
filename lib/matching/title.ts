import { editDistance, toleranceFor } from "./fuzzy";
import { normalizeName, tokenize } from "./normalize";

/**
 * Matching a title the player typed, the counterpart of `matchAnswer` for
 * people. Same principle: permissive on spelling, strict on identity.
 *
 * The identity risk is different though. Two people rarely share a name, but
 * films do it constantly — sequels, remakes, and reissues. So on top of the
 * discriminative guard, a title carrying a different number is never reachable
 * by typo tolerance: "Scream" must not answer for "Scream 2", which four edits
 * away would otherwise allow.
 */

export interface TitleBearing {
  title: string;
  /** TMDB's original-language title; accepted just as readily as the French one. */
  originalTitle?: string;
}

/** Leading articles players drop: "Le Shining" typed as "Shining". */
const ARTICLES = new Set([
  "le", "la", "les", "l", "un", "une", "des", "du", "de",
  "the", "a", "an",
]);

/**
 * Sequel numerals, listed rather than matched by a general Roman-numeral
 * pattern: that pattern also accepts ordinary words ("mix", "mil", "vi"), which
 * would make two unrelated titles look numerically different and block a
 * legitimate match. Films rarely number past this anyway.
 */
const SEQUEL_NUMERALS = new Set([
  "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii",
]);

const isNumberToken = (token: string): boolean =>
  /^\d+$/.test(token) || SEQUEL_NUMERALS.has(token);

/**
 * The numbers a title carries, in order. Two titles whose numbers differ are
 * different films, however close their letters are.
 */
export function numericSignature(input: string): string {
  return tokenize(input).filter(isNumberToken).join(" ");
}

function stripArticle(normalized: string): string | null {
  const tokens = normalized.split(" ");
  if (tokens.length < 2 || !ARTICLES.has(tokens[0])) return null;
  return tokens.slice(1).join(" ");
}

/** Every written form of a title we accept, longest-lived first. */
export function formsOf(film: TitleBearing): string[] {
  const forms: string[] = [];
  for (const raw of [film.title, film.originalTitle]) {
    if (!raw) continue;
    const normalized = normalizeName(raw);
    if (!normalized) continue;
    forms.push(normalized);
    const bare = stripArticle(normalized);
    if (bare) forms.push(bare);
  }
  return [...new Set(forms)];
}

export type TitleMatchKind = "exact" | "fuzzy" | "none";

export interface TitleMatchResult {
  ok: boolean;
  kind: TitleMatchKind;
  /** Edit distance to the matched form; 0 when typed exactly. */
  distance: number;
}

export interface TitleMatchOptions {
  /** Other films in the deck — used to reject a guess that fits one of them better. */
  corpus?: TitleBearing[];
}

/**
 * Best edit distance from any spelling of the guess to any accepted form,
 * numbers permitting. The article is optional on both sides: the stored title
 * may carry one the player drops, or lack one the player adds.
 */
function score(guesses: string[], film: TitleBearing, guessNumbers: string): number {
  let best = Infinity;
  for (const form of formsOf(film)) {
    // A different number makes this form unreachable by tolerance alone.
    if (numericSignature(form) !== guessNumbers) continue;
    for (const guess of guesses) {
      if (form === guess) return 0;
      best = Math.min(best, editDistance(guess, form, best));
    }
  }
  return best;
}

/** The guess as typed, plus the same without its leading article. */
function guessForms(guess: string): string[] {
  const bare = stripArticle(guess);
  return bare ? [guess, bare] : [guess];
}

export function matchTitle(
  input: string,
  film: TitleBearing,
  { corpus = [] }: TitleMatchOptions = {},
): TitleMatchResult {
  const guess = normalizeName(input);
  if (!guess) return { ok: false, kind: "none", distance: Infinity };

  const guesses = guessForms(guess);
  const guessNumbers = numericSignature(guess);
  const distance = score(guesses, film, guessNumbers);
  if (distance === 0) return { ok: true, kind: "exact", distance: 0 };

  // Measured against the shortest accepted form: tolerating three edits on
  // "Alien" because the original title is longer would be too generous.
  const shortest = formsOf(film).reduce(
    (min, form) => Math.min(min, form.length),
    Infinity,
  );
  if (distance > toleranceFor(shortest === Infinity ? guess : "x".repeat(shortest))) {
    return { ok: false, kind: "none", distance };
  }

  // Someone else's title fits better, so that is the film they named.
  const others = corpus.filter((other) => formsOf(other)[0] !== formsOf(film)[0]);
  for (const other of others) {
    if (score(guesses, other, guessNumbers) < distance) {
      return { ok: false, kind: "none", distance };
    }
  }

  return { ok: true, kind: "fuzzy", distance };
}
