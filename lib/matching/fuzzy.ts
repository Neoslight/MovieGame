import type { Person } from "../types";
import { bareSurname, normalizeName, surname, tokenSignature } from "./normalize";

/**
 * Optimal string alignment distance: Levenshtein plus adjacent transposition,
 * which is the single most common typo ("scorcese" -> "scorsese" is one edit,
 * "kubrcik" -> "kubrick" is one transposition rather than two edits).
 * Bails out early once every cell in a row exceeds `max`.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr: number[] = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2] + 1);
      }
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = curr;
    curr = new Array(b.length + 1);
  }
  return prev[b.length];
}

/**
 * How many typos we forgive, scaled to the length of the target. A fixed
 * threshold is either useless on "Coen" or a free pass on "Bertolucci".
 */
export function toleranceFor(target: string): number {
  if (target.length <= 5) return 1;
  if (target.length <= 10) return 2;
  return 3;
}

export type MatchKind =
  | "exact"
  | "alias"
  | "swap"
  | "surname"
  | "fuzzy"
  | "ambiguous"
  | "none";

export interface MatchResult {
  ok: boolean;
  kind: MatchKind;
  /** Edit distance to the matched form; 0 for exact/alias/swap/surname. */
  distance: number;
  person?: Person;
  /** Set when a bare surname points at several people in the deck. */
  ambiguousWith?: string[];
}

/** Every written form of a person we are willing to accept. */
function formsOf(person: Person): string[] {
  const forms = [person.name, ...person.aliases].map(normalizeName).filter(Boolean);
  return [...new Set(forms)];
}

export interface MatchOptions {
  /** Everyone else in the deck — used to reject answers that fit them better. */
  corpus?: Person[];
}

/**
 * Decide whether `input` names one of `targets`.
 *
 * Permissive on spelling, strict on identity: an answer is rejected whenever
 * some *other* person in the deck is a closer fit, so tolerance never turns
 * into accepting the wrong director because their name looks alike.
 */
export function matchAnswer(
  input: string,
  targets: Person[],
  { corpus = [] }: MatchOptions = {},
): MatchResult {
  const guess = normalizeName(input);
  if (!guess) return { ok: false, kind: "none", distance: Infinity };

  const others = corpus.filter((p) => !targets.some((t) => t.tmdbId === p.tmdbId));

  // 1. Exact, then alias, then reversed word order.
  for (const person of targets) {
    const forms = formsOf(person);
    if (forms[0] === guess) return { ok: true, kind: "exact", distance: 0, person };
    if (forms.includes(guess)) return { ok: true, kind: "alias", distance: 0, person };
    if (forms.some((f) => tokenSignature(f) === tokenSignature(guess))) {
      return { ok: true, kind: "swap", distance: 0, person };
    }
  }

  // 2. Surname alone — accepted only when it is unambiguous across the deck.
  const isSingleToken = guess.split(" ").length === 1;
  for (const person of targets) {
    const surnameForms = new Set([surname(person.name), bareSurname(person.name)]);
    if (!surnameForms.has(guess)) continue;

    const clashes = others.filter((p) =>
      new Set([surname(p.name), bareSurname(p.name)]).has(guess),
    );
    if (clashes.length > 0 && isSingleToken) {
      return {
        ok: false,
        kind: "ambiguous",
        distance: 0,
        person,
        ambiguousWith: [person.name, ...clashes.map((p) => p.name)],
      };
    }
    return { ok: true, kind: "surname", distance: 0, person };
  }

  // 3. Typo tolerance, against the full name and against the surname alone.
  const score = (person: Person): number => {
    let best = Infinity;
    for (const form of formsOf(person)) {
      best = Math.min(best, editDistance(guess, form, best));
      if (isSingleToken) {
        for (const s of [surname(person.name), bareSurname(person.name)]) {
          if (s) best = Math.min(best, editDistance(guess, s, best));
        }
      }
    }
    return best;
  };

  let bestPerson: Person | undefined;
  let bestDistance = Infinity;
  for (const person of targets) {
    const d = score(person);
    if (d < bestDistance) {
      bestDistance = d;
      bestPerson = person;
    }
  }

  if (!bestPerson) return { ok: false, kind: "none", distance: Infinity };

  const reference = isSingleToken ? surname(bestPerson.name) : normalizeName(bestPerson.name);
  if (bestDistance > toleranceFor(reference || bestPerson.name)) {
    return { ok: false, kind: "none", distance: bestDistance, person: bestPerson };
  }

  // 4. Discriminative guard: someone else fits better, so this is their name.
  for (const other of others) {
    if (score(other) < bestDistance) {
      return { ok: false, kind: "none", distance: bestDistance, person: bestPerson };
    }
  }

  return { ok: true, kind: "fuzzy", distance: bestDistance, person: bestPerson };
}
