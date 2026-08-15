/**
 * Checks the Letterboxd parser against a live profile.
 *   npx tsx scripts/verify-scrape.ts neoslight
 */
import {
  FILM_PAGE_PACE,
  normalizeUsername,
  resolveFilmRef,
  scrapeWatchedFilms,
} from "../lib/letterboxd/scrape";
import { pooled } from "../lib/http";

async function main() {
const username = normalizeUsername(process.argv[2] ?? "neoslight");

const started = Date.now();
const films = await scrapeWatchedFilms(username, (p) => {
  process.stdout.write(`\rPage ${p.page}/${p.totalPages} — ${p.films} films`);
});
process.stdout.write("\n");

console.log(`\n${films.length} films en ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log("Sans année :", films.filter((f) => f.year === null).length);
console.log("Échantillon :", films.slice(0, 3), films.slice(-3));

const sample = [...films].sort(() => Math.random() - 0.5).slice(0, 20);
console.log(`\nRésolution TMDB sur ${sample.length} films au hasard :`);
const resolved = await pooled(sample, (f) => resolveFilmRef(f), FILM_PAGE_PACE);
resolved.forEach((r, i) => {
  const f = sample[i];
  console.log(
    `  ${r ? String(r.tmdbId).padEnd(8) + r.tmdbType.padEnd(6) : "ÉCHEC".padEnd(14)} ${f.title} (${f.year}) [${f.slug}]`,
  );
});
console.log(`\nRésolus : ${resolved.filter(Boolean).length}/${sample.length}`);
}

main();
