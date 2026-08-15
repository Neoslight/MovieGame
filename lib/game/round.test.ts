import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actorsToFind,
  CAST_CLUE_SIZE,
  castClue,
  castToReveal,
  promptFor,
  requiredFor,
  scoreRound,
  scoreYear,
  targetsFor,
} from "./round";
import { Rating } from "../srs/scheduler";
import { playableCategories, type Film, type Person } from "../types";

const person = (id: number): Person => ({
  tmdbId: id,
  name: `Acteur ${id}`,
  profilePath: `/p${id}.jpg`,
  aliases: [],
});

const film = (voteCount: number | undefined, castSize = 30): Film => ({
  tmdbId: 1,
  slug: "x",
  title: "X",
  originalTitle: "X",
  year: 2000,
  posterPath: "/x.jpg",
  popularity: 1,
  voteCount,
  directors: [person(900)],
  cast: Array.from({ length: castSize }, (_, i) => person(i + 1)),
  cinematographers: [],
  composers: [],
  addedAt: 0,
});

test("the number of actors follows all-time notoriety", () => {
  assert.equal(actorsToFind(film(26000)), 4); // Avengers-scale
  assert.equal(actorsToFind(film(8000)), 4);
  assert.equal(actorsToFind(film(4000)), 3);
  assert.equal(actorsToFind(film(500)), 2);
  assert.equal(actorsToFind(film(120)), 1); // a documentary nobody rated
  assert.equal(actorsToFind(film(0)), 1);
});

test("a row imported before vote counts existed asks for one name", () => {
  assert.equal(actorsToFind(film(undefined)), 1);
});

test("a film never asks for more names than it credits", () => {
  assert.equal(actorsToFind(film(26000, 2)), 2);
  assert.equal(actorsToFind(film(26000, 1)), 1);
});

test("actors without a photo do not count towards the ask", () => {
  const sparse = film(26000, 4);
  sparse.cast = sparse.cast.map((p, i) => (i < 2 ? p : { ...p, profilePath: null }));
  assert.equal(actorsToFind(sparse), 2);
});

test("the reveal shows the billing, plus deep cuts the player named", () => {
  const deep = person(28);
  const shown = castToReveal(film(26000), [deep], 4);
  assert.equal(shown.length, 6, "top five billed plus the one found further down");
  assert.equal(shown.at(-1)?.tmdbId, 28);

  // Someone already in the billing is not repeated.
  assert.equal(castToReveal(film(26000), [person(2)], 4).length, 5);
});

test("naming half the cast asked for keeps the card moving", () => {
  const base = { category: "actors" as const, worstDistance: 0, elapsedMs: 3000, revealed: false };
  assert.equal(scoreRound({ ...base, foundCount: 2, required: 4 }).grade, Rating.Hard);
  assert.equal(scoreRound({ ...base, foundCount: 1, required: 4 }).grade, Rating.Again);
  assert.equal(scoreRound({ ...base, foundCount: 4, required: 4 }).correct, true);
});

test("l'année tolère un écart, sans devenir un tir à l'aveugle", () => {
  const at = (guess: number) =>
    scoreYear({ guess, actual: 1980, elapsedMs: 6000, revealed: false });

  assert.equal(at(1980).correct, true);
  assert.equal(at(1981).correct, true, "un an d'écart reste juste");
  assert.equal(at(1983).correct, true, "trois ans comptent encore");
  assert.equal(at(1983).grade, Rating.Hard, "mais jamais mieux que Hard");
  assert.equal(at(1984).correct, false, "quatre ans, le film n'est pas situé");
  assert.equal(at(1975).grade, Rating.Again);
});

test("l'année répondue vite reste notée sur la vitesse", () => {
  const fast = scoreYear({ guess: 1980, actual: 1980, elapsedMs: 1200, revealed: false });
  const slow = scoreYear({ guess: 1980, actual: 1980, elapsedMs: 20_000, revealed: false });
  assert.equal(fast.grade, Rating.Easy);
  assert.equal(slow.grade, Rating.Hard);
});

test("révéler l'année la compte comme oubliée", () => {
  const outcome = scoreYear({ guess: 1980, actual: 1980, elapsedMs: 900, revealed: true });
  assert.equal(outcome.correct, false);
  assert.equal(outcome.grade, Rating.Again);
});

test("les indices plafonnent la note sans invalider la réponse", () => {
  const base = {
    category: "director" as const,
    foundCount: 1,
    required: 1,
    worstDistance: 0,
    elapsedMs: 1200,
    revealed: false,
  };
  // Same perfect, instant answer — only the hints taken differ.
  assert.equal(scoreRound(base).grade, Rating.Easy);
  assert.equal(scoreRound({ ...base, hintsUsed: 1 }).grade, Rating.Good);
  assert.equal(scoreRound({ ...base, hintsUsed: 3 }).grade, Rating.Hard);
  assert.equal(scoreRound({ ...base, hintsUsed: 3 }).correct, true);

  // And on the year path too.
  assert.equal(
    scoreYear({ guess: 1980, actual: 1980, elapsedMs: 900, revealed: false, hintsUsed: 2 })
      .grade,
    Rating.Hard,
  );
});

test("le casting-indice reste court", () => {
  assert.equal(castClue(film(26000)).length, CAST_CLUE_SIZE);
  assert.equal(castClue(film(26000, 2)).length, 2);
});

test("one name closes the round even when the film has several directors", () => {
  const coens = film(9000);
  coens.directors = [person(901), person(902)];

  assert.equal(requiredFor(coens, "director"), 1);
  // Both still count as a right answer, and both still show at the reveal.
  assert.equal(targetsFor(coens, "director").length, 2);
});

test("the prompt says how many names are wanted", () => {
  assert.equal(promptFor("actors", 1), "Cite un acteur du film");
  assert.equal(promptFor("actors", 3), "Cite 3 acteurs du film");
  assert.match(promptFor("director", 1), /réalisé/);
  assert.match(promptFor("cinematographer", 1), /image/);
  assert.match(promptFor("composer", 1), /musique/);
});

test("les catégories techniques se jouent sur un seul nom", () => {
  const shot = film(9000);
  shot.cinematographers = [person(801), person(802)];
  shot.composers = [person(810)];

  // Like the director: naming one of two credited operators is remembering it.
  assert.equal(requiredFor(shot, "cinematographer"), 1);
  assert.equal(targetsFor(shot, "cinematographer").length, 2);
  assert.equal(requiredFor(shot, "composer"), 1);
  assert.equal(targetsFor(shot, "composer")[0].tmdbId, 810);
});

test("un film sans image ni musique créditées ne se joue pas dessus", () => {
  const bare = film(9000);
  assert.ok(!playableCategories(bare).includes("cinematographer"));
  assert.ok(!playableCategories(bare).includes("composer"));

  bare.cinematographers = [person(801)];
  assert.ok(playableCategories(bare).includes("cinematographer"));
  assert.ok(!playableCategories(bare).includes("composer"));
});

test("les catégories « quel film » demandent de quoi poser la question", () => {
  const rich = film(9000);
  const categories = playableCategories(rich);
  assert.ok(categories.includes("title-cast"));
  assert.ok(categories.includes("title-poster"));
  assert.ok(categories.includes("year"));

  // One face is a coin toss, not a question.
  const oneFace = film(9000, 1);
  assert.ok(!playableCategories(oneFace).includes("title-cast"));

  const undated = { ...film(9000), year: null };
  assert.ok(!playableCategories(undated).includes("year"));
  assert.ok(playableCategories(undated).includes("title-poster"));
});

test("un film sans affiche ne se joue sur aucune catégorie", () => {
  const noPoster = { ...film(9000), posterPath: null, cinematographers: [person(801)] };
  assert.deepEqual(playableCategories(noPoster), []);
});
