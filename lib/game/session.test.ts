import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SESSION, sanitizeSession } from "./session";

test("nothing stored yet falls back to the default", () => {
  assert.deepEqual(sanitizeSession(undefined), DEFAULT_SESSION);
  assert.deepEqual(sanitizeSession(null), DEFAULT_SESSION);
  assert.deepEqual(sanitizeSession("20"), DEFAULT_SESSION);
});

test("a valid choice is kept as is", () => {
  assert.deepEqual(sanitizeSession({ length: 40, categories: ["director"], mode: "srs" }), {
    length: 40,
    categories: ["director"],
    mode: "srs",
  });
});

test("le mode arcade est retenu, tout le reste retombe sur révision", () => {
  assert.equal(sanitizeSession({ length: 10, mode: "arcade" }).mode, "arcade");
  assert.equal(sanitizeSession({ length: 10, mode: "gloire" }).mode, "srs");
  assert.equal(sanitizeSession({ length: 10 }).mode, "srs");
});

test("an open session is a legal length", () => {
  assert.equal(sanitizeSession({ length: 0, categories: ["actors"] }).length, 0);
});

test("an unknown length reverts, without losing the categories", () => {
  assert.deepEqual(sanitizeSession({ length: 999, categories: ["actors"] }), {
    length: DEFAULT_SESSION.length,
    categories: ["actors"],
    mode: "srs",
  });
});

test("unknown categories are dropped, and an empty result reverts", () => {
  // "gaffer" is not a category and is not planned to be one — using a category
  // that later ships would quietly turn this test into a no-op.
  assert.deepEqual(sanitizeSession({ length: 10, categories: ["gaffer", "actors"] }), {
    length: 10,
    categories: ["actors"],
    mode: "srs",
  });
  assert.deepEqual(
    sanitizeSession({ length: 10, categories: ["gaffer"] }).categories,
    DEFAULT_SESSION.categories,
  );
});

test("les catégories livrées après coup sont acceptées", () => {
  assert.deepEqual(
    sanitizeSession({ length: 10, categories: ["cinematographer", "composer"] }).categories,
    ["cinematographer", "composer"],
  );
});
