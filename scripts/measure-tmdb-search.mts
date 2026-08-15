/**
 * What share of an archive the fast path can settle on its own — i.e. how much
 * of the import escapes the slow Letterboxd lookup.
 *
 *   npx tsx --env-file=.env.local scripts/measure-tmdb-search.mts [archive]
 */
import { readFileSync } from "node:fs";
import { pooled } from "../lib/http";
import { parseLetterboxdArchive } from "../lib/letterboxd/csv";
import { searchConfidentMatch } from "../lib/tmdb/search";

const archive = process.argv[2] ?? "letterboxd-neoslight-2026-08-15-16-01-utc.zip";
const { films } = parseLetterboxdArchive(new Uint8Array(readFileSync(archive)));

const started = Date.now();
const deferred: string[] = [];

const matches = await pooled(
  films,
  async (film) => {
    const match = await searchConfidentMatch(film);
    if (!match && deferred.length < 12) deferred.push(`${film.title} (${film.year})`);
    return match;
  },
  { concurrency: 10, delayMs: 0 },
);

const settled = matches.filter(Boolean).length;
const slow = films.length - settled;
const seconds = (Date.now() - started) / 1000;

console.log(`\n${films.length} films, ${seconds.toFixed(0)} s de recherches TMDB\n`);
console.log(`  tranchés par la recherche  ${settled}  ${((settled / films.length) * 100).toFixed(1)} %`);
console.log(`  renvoyés à Letterboxd      ${slow}  ${((slow / films.length) * 100).toFixed(1)} %`);
console.log(
  `\nImport estimé : ${seconds.toFixed(0)} s + ${((slow * 0.9) / 60).toFixed(1)} min de repli` +
    `  (voie lente seule : ${((films.length * 0.9) / 60).toFixed(0)} min)`,
);
console.log(`\nExemples renvoyés à Letterboxd :\n  ${deferred.join("\n  ")}`);
