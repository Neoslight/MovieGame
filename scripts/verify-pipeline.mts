/**
 * End-to-end check on real data: archive -> boxd.it -> TMDB id -> credits.
 *   npx tsx --env-file=.env.local scripts/verify-pipeline.mts [count]
 */
import { readFileSync } from "node:fs";
import { pooled } from "../lib/http";
import { parseLetterboxdArchive } from "../lib/letterboxd/csv";
import { FILM_PAGE_PACE, resolveFilmRef } from "../lib/letterboxd/scrape";
import { fetchFilm } from "../lib/tmdb/client";
import { playableCategories } from "../lib/types";

const archive = process.argv[3] ?? "letterboxd-neoslight-2026-08-15-16-01-utc.zip";
const count = Number(process.argv[2] ?? 25);

const { films: all, source, username } = parseLetterboxdArchive(
  new Uint8Array(readFileSync(archive)),
);
console.log(`Archive : ${all.length} films depuis ${source} (compte ${username})`);
console.log(`Liens courts : ${all.filter((f) => !f.slug).length}\n`);

const sample = [...all].sort(() => Math.random() - 0.5).slice(0, count);

const t = Date.now();
const resolved = await pooled(sample, (f) => resolveFilmRef(f), FILM_PAGE_PACE);
console.log(`Résolution : ${resolved.filter(Boolean).length}/${count} en ${((Date.now() - t) / 1000).toFixed(0)}s\n`);

const enriched = await pooled(
  resolved.map((r, i) => ({ r, source: sample[i] })),
  async ({ r, source }) => {
    if (!r || r.tmdbType !== "movie") return { source, film: null, note: r ? "série" : "non résolu" };
    try {
      return { source, film: await fetchFilm(r.tmdbId, r.slug), note: "" };
    } catch (e) {
      return { source, film: null, note: (e as Error).message };
    }
  },
  { concurrency: 8, delayMs: 0 },
);

let playable = 0;
let missingDop = 0;
let missingComposer = 0;

for (const { source, film, note } of enriched) {
  if (!film) {
    console.log(`  ✗ ${source.title} (${source.year}) — ${note}`);
    continue;
  }
  const cats = playableCategories(film);
  if (cats.length) playable++;
  if (film.cinematographers.length === 0) missingDop++;
  if (film.composers.length === 0) missingComposer++;
  console.log(
    `  ✓ ${film.title} (${film.year}) — réal : ${film.directors.map((d) => d.name).join(", ") || "?"}` +
      ` | casting : ${film.cast.length} | affiche : ${film.posterPath ? "oui" : "non"} | ${cats.join("+") || "injouable"}`,
  );
}

const ok = enriched.filter((e) => e.film).length;
console.log(`\nEnrichis : ${ok}/${count} · jouables : ${playable}/${count}`);
console.log(`Couverture (pour les catégories futures) — chef op absent : ${missingDop}/${ok}, compositeur absent : ${missingComposer}/${ok}`);
