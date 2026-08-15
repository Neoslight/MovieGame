import assert from "node:assert/strict";
import { test } from "node:test";
import {
  byDecade,
  currentStreak,
  forgotten,
  MIN_REVIEWS,
  topDirectors,
  weakDirectors,
} from "./overview";
import { State } from "../srs/scheduler";
import type { Card, Review } from "../db/schema";
import type { Film, Person } from "../types";

const person = (name: string): Person => ({
  tmdbId: name.length * 31,
  name,
  profilePath: null,
  aliases: [],
});

const film = (tmdbId: number, year: number | null, directors: string[]): Film => ({
  tmdbId,
  slug: `f${tmdbId}`,
  title: `Film ${tmdbId}`,
  originalTitle: `Film ${tmdbId}`,
  year,
  posterPath: "/p.jpg",
  popularity: 1,
  voteCount: 100,
  directors: directors.map(person),
  cast: [],
  cinematographers: [],
  composers: [],
  addedAt: 0,
});

const review = (filmId: number, correct: boolean, over: Partial<Review> = {}): Review => ({
  cardId: 1,
  filmId,
  category: "director",
  ts: Date.now(),
  correct,
  rating: 3,
  userAnswer: "",
  expected: "",
  distance: 0,
  durationMs: 1000,
  mode: "srs",
  filmTitle: `Film ${filmId}`,
  posterPath: null,
  ...over,
});

const card = (filmId: number, over: Partial<Card> = {}): Card =>
  ({
    id: filmId,
    filmId,
    category: "director",
    popularity: 1,
    due: new Date(),
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 3,
    lapses: 0,
    state: State.Review,
    ...over,
  }) as Card;

test("le portrait ne retient que les récurrences", () => {
  const films = [
    film(1, 1980, ["Kubrick"]),
    film(2, 1971, ["Kubrick"]),
    film(3, 1999, ["Kubrick"]),
    film(4, 1994, ["Tarantino"]),
    film(5, 1976, ["Scorsese"]),
  ];
  const top = topDirectors(films);
  assert.equal(top[0].name, "Kubrick");
  assert.equal(top[0].count, 3);
  // Seen once is not a taste.
  assert.ok(!top.some((t) => t.name === "Scorsese"));
});

test("les décennies sortent dans l'ordre", () => {
  const decades = byDecade([film(1, 1980, []), film(2, 1989, []), film(3, 1971, [])]);
  assert.deepEqual(decades, [
    { decade: 1970, count: 1 },
    { decade: 1980, count: 2 },
  ]);
});

test("un film sans année ne fabrique pas de décennie", () => {
  assert.deepEqual(byDecade([film(1, null, [])]), []);
});

test("un angle mort exige des preuves", () => {
  const films = [film(1, 1980, ["Kubrick"]), film(2, 1971, ["Kubrick"])];

  // A single miss is a bad evening, not a blind spot.
  assert.deepEqual(weakDirectors([review(1, false)], films), []);

  const weak = weakDirectors([review(1, false), review(2, false)], films);
  assert.equal(weak.length, 1);
  assert.equal(weak[0].name, "Kubrick");
  assert.equal(weak[0].missed, 2);
  assert.deepEqual(weak[0].filmIds.sort(), [1, 2]);
});

test("un réalisateur majoritairement trouvé n'est pas un angle mort", () => {
  const films = [film(1, 1980, ["Kubrick"]), film(2, 1971, ["Kubrick"])];
  assert.deepEqual(weakDirectors([review(1, true), review(2, false)], films), []);
});

test("l'arcade ne noircit pas le bilan", () => {
  const films = [film(1, 1980, ["Kubrick"]), film(2, 1971, ["Kubrick"])];
  const arcade = [
    review(1, false, { mode: "arcade" }),
    review(2, false, { mode: "arcade" }),
  ];
  assert.deepEqual(weakDirectors(arcade, films), []);
  assert.ok(MIN_REVIEWS >= 2);
});

test("les films oubliés sont ceux qu'on a déjà joués", () => {
  const films = [film(1, 1980, []), film(2, 1971, []), film(3, 1999, [])];
  const cards = [
    card(1, { lapses: 3 }),
    // Never played: unknown, not forgotten.
    card(2, { lapses: 5, reps: 0 }),
    card(3, { lapses: 0, state: State.Relearning }),
  ];
  const out = forgotten(cards, films).map((f) => f.tmdbId);
  assert.deepEqual(out, [1, 3]);
});

test("la série compte les jours consécutifs", () => {
  const day = 86_400_000;
  const now = new Date("2026-08-15T20:00:00");
  const at = (daysAgo: number) => review(1, true, { ts: now.getTime() - daysAgo * day });

  assert.equal(currentStreak([at(0), at(1), at(2)], now), 3);
  // A gap ends it.
  assert.equal(currentStreak([at(0), at(2), at(3)], now), 1);
  assert.equal(currentStreak([], now), 0);
});

test("ne pas avoir encore joué aujourd'hui ne casse pas la série", () => {
  const day = 86_400_000;
  const now = new Date("2026-08-15T09:00:00");
  const at = (daysAgo: number) => review(1, true, { ts: now.getTime() - daysAgo * day });

  assert.equal(currentStreak([at(1), at(2)], now), 2);
});

test("une partie d'arcade ne maintient pas la série", () => {
  const now = new Date("2026-08-15T20:00:00");
  const arcade = review(1, true, { ts: now.getTime(), mode: "arcade" });
  assert.equal(currentStreak([arcade], now), 0);
});
