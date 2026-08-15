/** Name particles that players routinely drop: "von Trier" ≈ "Trier". */
const PARTICLES = new Set([
  "de", "del", "della", "der", "di", "du", "da", "das", "dos",
  "la", "le", "van", "von", "den", "ter", "ten", "al", "el", "bin", "ibn",
]);

/**
 * Casefold a name down to what we actually compare: no diacritics, no
 * punctuation, single spaces. "Pedro Almodóvar" -> "pedro almodovar".
 */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD") // decompose, then strip the combining accents
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`´]/g, "")
    // Keep letters and digits from every script: film titles and credited
    // names are not always Latin, and dropping them would collapse distinct
    // titles into the same empty string.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(input: string): string[] {
  return normalizeName(input).split(" ").filter(Boolean);
}

/**
 * The surname, with particles glued back on: "lars von trier" -> "von trier".
 * Players type either "von trier" or "trier", so callers accept both.
 */
export function surname(input: string): string {
  const tokens = tokenize(input);
  if (tokens.length <= 1) return tokens[0] ?? "";

  let start = tokens.length - 1;
  while (start > 1 && PARTICLES.has(tokens[start - 1])) start--;
  return tokens.slice(start).join(" ");
}

/** The surname without its particles — the other spelling players use. */
export function bareSurname(input: string): string {
  const tokens = tokenize(input);
  return tokens.length ? tokens[tokens.length - 1] : "";
}

/**
 * Asian names are credited in both orders (Bong Joon-ho / Joon-ho Bong), and
 * TMDB is inconsistent about which. Comparing sorted tokens catches the swap
 * without loosening the character-level tolerance.
 */
export function tokenSignature(input: string): string {
  return tokenize(input).sort().join(" ");
}
