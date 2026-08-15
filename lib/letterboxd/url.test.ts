import assert from "node:assert/strict";
import { test } from "node:test";
import { letterboxdUrl } from "./url";

test("un vrai slug donne la page du film", () => {
  assert.equal(letterboxdUrl({ slug: "the-shining" }), "https://letterboxd.com/film/the-shining/");
});

test("un lien court importé par CSV est utilisé tel quel", () => {
  // The bug this guards: a CSV deck stores the short link in `slug`, so naively
  // interpolating it produced letterboxd.com/film/https://boxd.it/23gY/.
  assert.equal(letterboxdUrl({ slug: "https://boxd.it/23gY" }), "https://boxd.it/23gY");
  assert.equal(letterboxdUrl({ slug: "boxd.it/23gY" }), "https://boxd.it/23gY");
});

test("un slug vide ne fabrique pas une URL cassée", () => {
  assert.equal(letterboxdUrl({ slug: "" }), "https://letterboxd.com/");
  assert.equal(letterboxdUrl({ slug: "   " }), "https://letterboxd.com/");
});
