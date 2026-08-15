/**
 * Does the fast path give the same film as Letterboxd's exact id?
 *
 * Resolves a random sample both ways and reports disagreements. A single
 * disagreement matters more than the speed gain: a wrong id means asking who
 * directed a film the player never saw.
 *
 *   npx tsx --env-file=.env.local scripts/verify-fast-path.mts [sample]
 */
import { readFileSync } from "node:fs";
import { pooled } from "../lib/http";
import { parseLetterboxdArchive } from "../lib/letterboxd/csv";
import { FILM_PAGE_PACE, resolveFilmRef } from "../lib/letterboxd/scrape";
import { searchConfidentMatch } from "../lib/tmdb/search";

const size = Number(process.argv[2] ?? 80);
const { films } = parseLetterboxdArchive(
  new Uint8Array(readFileSync("letterboxd-neoslight-2026-08-15-16-01-utc.zip")),
);

const sample = [...films].sort(() => Math.random() - 0.5).slice(0, size);

console.log(`Recherche TMDB sur ${size} films…`);
const fast = await pooled(sample, (f) => searchConfidentMatch(f), {
  concurrency: 10,
  delayMs: 0,
});

console.log("Résolution Letterboxd (référence)…");
const truth = await pooled(sample, (f) => resolveFilmRef(f), FILM_PAGE_PACE);

let agree = 0;
let disagree = 0;
let deferred = 0;
let deferredCorrectlyTv = 0;
let truthMissing = 0;

for (let i = 0; i < sample.length; i++) {
  const film = sample[i];
  const label = `${film.title} (${film.year})`;

  if (!truth[i]) {
    truthMissing++;
    if (fast[i]) console.log(`  ?  ${label} — Letterboxd muet, recherche propose ${fast[i]!.tmdbId}`);
    continue;
  }

  if (!fast[i]) {
    deferred++;
    if (truth[i]!.tmdbType === "tv") deferredCorrectlyTv++;
    continue;
  }

  if (fast[i]!.tmdbId === truth[i]!.tmdbId) agree++;
  else {
    disagree++;
    console.log(
      `  ✗ ${label} — recherche ${fast[i]!.tmdbId} vs Letterboxd ${truth[i]!.tmdbId} (${truth[i]!.tmdbType})`,
    );
  }
}

const decided = agree + disagree;
console.log(`\nTranchés par la recherche : ${decided}/${sample.length}`);
console.log(`  identiques  ${agree}`);
console.log(`  divergents  ${disagree}`);
console.log(`Renvoyés à Letterboxd : ${deferred} (dont ${deferredCorrectlyTv} séries, écartées à raison)`);
if (truthMissing) console.log(`Sans référence Letterboxd : ${truthMissing}`);
console.log(
  disagree === 0
    ? "\nAucune divergence : la voie rapide donne le même film."
    : `\n${disagree} divergence(s) — la règle de confiance doit être resserrée.`,
);
