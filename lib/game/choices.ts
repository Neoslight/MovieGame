/**
 * The four-option rescue offered once the hint ladder runs out.
 *
 * Recall and recognition are different memories, and a round that ends on a
 * blank cannot tell them apart. Picking the right name out of four says the
 * film is not gone, only out of reach — worth a Hard rather than an Again.
 *
 * A distractor has to be wrong but plausible: an option nobody would ever pick
 * makes the question free, and an option that is *also* right makes it unfair.
 */

export const CHOICE_COUNT = 4;

export interface Choice<T> {
  value: T;
  label: string;
}

export interface ChoicesOptions<T> {
  /** Everything that would also be a right answer, and so cannot be a decoy. */
  excluded?: readonly T[];
  random?: () => number;
}

/** Fisher-Yates, so the answer is not always in the same slot. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Builds the option list: the answer plus decoys drawn from `pool`.
 *
 * `key` identifies an option, so a decoy is never the answer wearing a
 * different label — the same person credited twice, or a film present under
 * both its titles.
 */
export function buildChoices<T>(
  answer: T,
  pool: readonly T[],
  key: (item: T) => string | number,
  label: (item: T) => string,
  { excluded = [], random = Math.random }: ChoicesOptions<T> = {},
): Choice<T>[] {
  const forbidden = new Set<string | number>([key(answer), ...excluded.map(key)]);
  // Seeded with the answer's own label: TMDB credits the same person under two
  // ids often enough, and two identical options would read as a broken question
  // — or worse, as a wrong answer when the player picks the other one.
  const takenLabels = new Set<string>([label(answer), ...excluded.map(label)]);

  const candidates: T[] = [];
  const seen = new Set<string | number>();
  for (const item of pool) {
    const id = key(item);
    if (forbidden.has(id) || seen.has(id)) continue;
    if (takenLabels.has(label(item))) continue;
    seen.add(id);
    takenLabels.add(label(item));
    candidates.push(item);
  }

  const decoys = shuffle(candidates, random).slice(0, CHOICE_COUNT - 1);
  return shuffle([answer, ...decoys], random).map((value) => ({ value, label: label(value) }));
}
