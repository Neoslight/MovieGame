import assert from "node:assert/strict";
import { test } from "node:test";
import { BackupFormatError, parseBackup } from "./backup";

const person = { tmdbId: 1, name: "Stanley Kubrick", profilePath: "/k.jpg", aliases: [] };

const film = {
  tmdbId: 694,
  slug: "the-shining",
  title: "Shining",
  originalTitle: "The Shining",
  year: 1980,
  posterPath: "/s.jpg",
  popularity: 42,
  voteCount: 17000,
  directors: [person],
  cast: [person],
  cinematographers: [],
  composers: [],
  addedAt: 0,
};

const card = {
  id: 1,
  filmId: 694,
  category: "director",
  popularity: 42,
  due: "2026-01-01T10:00:00.000Z",
  stability: 3,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 1,
  reps: 2,
  lapses: 0,
  state: 2,
};

const valid = { version: 1, films: [film], cards: [card], reviews: [], settings: [] };

test("une sauvegarde valide passe", () => {
  const out = parseBackup(valid);
  assert.equal(out.films.length, 1);
  assert.equal(out.cards.length, 1);
});

test("les dates JSON redeviennent des Date", () => {
  // FSRS works on Date; a round-trip through JSON turns them into strings, so a
  // restored card would otherwise not behave like a live one.
  const [restored] = parseBackup(valid).cards;
  assert.ok(restored.due instanceof Date);
  assert.equal(restored.due.toISOString(), "2026-01-01T10:00:00.000Z");
});

test("un JSON valide mais étranger est refusé avant toute écriture", () => {
  // The destructive case: parses fine, is not a backup. Before the guard this
  // wiped the deck and then committed the garbage.
  assert.throws(() => parseBackup({ hello: "world" }), BackupFormatError);
  assert.throws(() => parseBackup([1, 2, 3]), BackupFormatError);
  assert.throws(() => parseBackup(null), BackupFormatError);
});

test("un fichier sans aucun film ni carte est refusé", () => {
  assert.throws(
    () => parseBackup({ films: [], cards: [], reviews: [], settings: [] }),
    BackupFormatError,
  );
});

test("un film amputé d'un champ est refusé", () => {
  const broken = { ...valid, films: [{ ...film, tmdbId: "694" }] };
  assert.throws(() => parseBackup(broken), BackupFormatError);
});

test("les avis d'avant le mode arcade sont réputés être des révisions", () => {
  const legacy = {
    ...valid,
    reviews: [
      {
        id: 1,
        cardId: 1,
        filmId: 694,
        category: "director",
        ts: 1,
        correct: true,
        rating: 3,
        userAnswer: "Kubrick",
        expected: "Stanley Kubrick",
        distance: 0,
        durationMs: 900,
        filmTitle: "Shining",
        posterPath: "/s.jpg",
      },
    ],
  };
  assert.equal(parseBackup(legacy).reviews[0].mode, "srs");
});

test("les champs inconnus d'une version future survivent", () => {
  const future = { ...valid, films: [{ ...film, mood: "glacial" }] };
  const [restored] = parseBackup(future).films;
  assert.equal((restored as unknown as { mood: string }).mood, "glacial");
});
