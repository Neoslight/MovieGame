import assert from "node:assert/strict";
import test from "node:test";
import { pickConfidentHit, type MultiHit } from "./search";
import type { LetterboxdFilm } from "../types";

const movie = (over: Partial<MultiHit>): MultiHit => ({
  id: 1,
  media_type: "movie",
  release_date: "2019-05-30",
  ...over,
});

const ask = (title: string, year: number | null): LetterboxdFilm => ({
  slug: null,
  title,
  year,
});

test("tranche quand un seul titre correspond dans l'année", () => {
  const match = pickConfidentHit(ask("Parasite", 2019), [
    movie({ id: 496243, title: "Parasite", original_title: "기생충" }),
    movie({ id: 999, title: "Parasite Doctor Suzune", release_date: "2011-01-01" }),
  ]);
  assert.deepEqual(match, { tmdbId: 496243, tmdbType: "movie" });
});

test("reconnaît le titre original", () => {
  const match = pickConfidentHit(ask("기생충", 2019), [
    movie({ id: 496243, title: "Parasite", original_title: "기생충" }),
  ]);
  assert.equal(match?.tmdbId, 496243);
});

test("refuse deux films homonymes de la même année", () => {
  const match = pickConfidentHit(ask("Mother", 2019), [
    movie({ id: 1, title: "Mother", release_date: "2019-03-01" }),
    movie({ id: 2, title: "Mother", release_date: "2019-09-01" }),
  ]);
  assert.equal(match, null);
});

test("refuse quand une série porte le même titre la même année", () => {
  // The film may well be the right answer, but only Letterboxd can say so.
  const match = pickConfidentHit(ask("Adolescence", 2025), [
    movie({ id: 10, title: "Adolescence", release_date: "2025-01-01" }),
    movie({
      id: 11,
      media_type: "tv",
      name: "Adolescence",
      first_air_date: "2025-03-13",
      release_date: undefined,
    }),
  ]);
  assert.equal(match, null);
});

test("ne renvoie jamais une série", () => {
  const match = pickConfidentHit(ask("WandaVision", 2021), [
    movie({
      id: 12,
      media_type: "tv",
      name: "WandaVision",
      first_air_date: "2021-01-15",
      release_date: undefined,
    }),
  ]);
  assert.equal(match, null);
});

test("tolère un an d'écart, pas trois", () => {
  const hits = [movie({ id: 20, title: "Bugonia", release_date: "2025-10-24" })];
  assert.ok(pickConfidentHit(ask("Bugonia", 2026), hits));
  assert.equal(pickConfidentHit(ask("Bugonia", 2028), hits), null);
});

test("ignore casse, accents et ponctuation", () => {
  const hits = [movie({ id: 30, title: "Irréalisable", release_date: "2026-01-01" })];
  assert.ok(pickConfidentHit(ask("IRREALISABLE", 2026), hits));
});

test("refuse un titre seulement approchant", () => {
  const match = pickConfidentHit(ask("Parasite", 2019), [
    movie({ id: 40, title: "Parasite Eve" }),
  ]);
  assert.equal(match, null);
});

test("accepte sans année quand le titre est unique", () => {
  const match = pickConfidentHit(ask("Bugonia", null), [
    movie({ id: 20, title: "Bugonia", release_date: "2025-10-24" }),
  ]);
  assert.equal(match?.tmdbId, 20);
});

test("refuse quand la recherche ne renvoie rien", () => {
  assert.equal(pickConfidentHit(ask("Film inexistant", 1999), []), null);
});
