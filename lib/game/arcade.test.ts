import assert from "node:assert/strict";
import { test } from "node:test";
import { ARCADE_LIVES, isOver, newRun, nextArcade } from "./arcade";
import type { Film, Person } from "../types";

const person = (id: number): Person => ({
  tmdbId: id,
  name: `P${id}`,
  profilePath: "/p.jpg",
  aliases: [],
});

const film = (tmdbId: number, over: Partial<Film> = {}): Film => ({
  tmdbId,
  slug: `f${tmdbId}`,
  title: `Film ${tmdbId}`,
  originalTitle: `Film ${tmdbId}`,
  year: 1980,
  posterPath: "/p.jpg",
  popularity: 10,
  voteCount: 9000,
  directors: [person(900 + tmdbId)],
  cast: [person(tmdbId * 10), person(tmdbId * 10 + 1)],
  cinematographers: [],
  composers: [],
  addedAt: 0,
  ...over,
});

test("une partie commence à zéro", () => {
  const run = newRun();
  assert.equal(run.score, 0);
  assert.equal(run.mistakes, 0);
  assert.equal(isOver(run), false);
});

test("trois fautes terminent la partie", () => {
  assert.equal(isOver({ score: 9, mistakes: ARCADE_LIVES - 1, seen: [] }), false);
  assert.equal(isOver({ score: 9, mistakes: ARCADE_LIVES, seen: [] }), true);
  // Never strands the player past the limit.
  assert.equal(isOver({ score: 9, mistakes: ARCADE_LIVES + 2, seen: [] }), true);
});

test("le tirage respecte les catégories choisies", () => {
  const films = [film(1), film(2), film(3)];
  for (let i = 0; i < 20; i++) {
    const drawn = nextArcade(films, ["director"], newRun(), () => i / 20);
    assert.equal(drawn?.category, "director");
  }
});

test("ne tire jamais un film injouable dans la catégorie demandée", () => {
  // No composer credited anywhere, so there is nothing to ask.
  const films = [film(1), film(2)];
  assert.equal(nextArcade(films, ["composer"], newRun()), null);

  const scored = [film(1), film(2, { composers: [person(77)] })];
  const drawn = nextArcade(scored, ["composer"], newRun());
  assert.equal(drawn?.film.tmdbId, 2);
});

test("un deck vide ne plante pas", () => {
  assert.equal(nextArcade([], ["director"], newRun()), null);
});

test("les films vus récemment sont écartés", () => {
  const films = [film(1), film(2), film(3)];
  const state = { score: 0, mistakes: 0, seen: [1, 2] };
  for (let i = 0; i < 20; i++) {
    const drawn = nextArcade(films, ["director"], state, () => i / 20);
    assert.equal(drawn?.film.tmdbId, 3, "seul le film non vu doit sortir");
  }
});

test("un deck plus petit que la fenêtre anti-répétition reste jouable", () => {
  // Blocking everything would end the run early; the full set comes back.
  const films = [film(1)];
  const state = { score: 0, mistakes: 0, seen: [1, 1, 1] };
  assert.equal(nextArcade(films, ["director"], state)?.film.tmdbId, 1);
});
