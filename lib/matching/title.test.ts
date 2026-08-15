import assert from "node:assert/strict";
import { test } from "node:test";
import { matchTitle, numericSignature } from "./title";

const f = (title: string, originalTitle?: string) => ({ title, originalTitle });

const shining = f("Shining", "The Shining");
const scream = f("Scream");
const scream2 = f("Scream 2");
const bladeRunner = f("Blade Runner");
const blade2049 = f("Blade Runner 2049");
const rocky = f("Rocky");
const rocky5 = f("Rocky V");
const misérables = f("Les Misérables");
const parasite = f("Parasite", "기생충");
const odyssey = f("2001, l'Odyssée de l'espace", "2001: A Space Odyssey");

const DECK = [
  shining, scream, scream2, bladeRunner, blade2049,
  rocky, rocky5, misérables, parasite, odyssey,
];
const match = (input: string, film: (typeof DECK)[number]) =>
  matchTitle(input, film, { corpus: DECK });

test("accepte le titre exact", () => {
  assert.equal(match("Shining", shining).ok, true);
  assert.equal(match("Blade Runner", bladeRunner).kind, "exact");
});

test("accepte le titre original", () => {
  assert.equal(match("The Shining", shining).ok, true);
  assert.equal(match("기생충", parasite).ok, true);
});

test("ignore casse, accents et ponctuation", () => {
  assert.equal(match("les miserables", misérables).ok, true);
  assert.equal(match("LES MISÉRABLES", misérables).ok, true);
  assert.equal(match("2001 a space odyssey", odyssey).ok, true);
});

test("tolère l'article initial manquant", () => {
  assert.equal(match("Misérables", misérables).ok, true);
  // And the other way round: the stored title has no article, the player adds one.
  assert.equal(match("The Blade Runner", bladeRunner).ok, true);
});

test("pardonne une faute de frappe", () => {
  assert.equal(match("Shinning", shining).ok, true);
  assert.equal(match("Blade Runer", bladeRunner).ok, true);
});

test("une suite ne valide jamais l'original", () => {
  // The whole point: four edits apart, but a different film.
  assert.equal(match("Scream", scream2).ok, false);
  assert.equal(match("Scream 2", scream).ok, false);
  assert.equal(match("Blade Runner", blade2049).ok, false);
  assert.equal(match("Blade Runner 2049", bladeRunner).ok, false);
});

test("les chiffres romains comptent comme un numéro de suite", () => {
  assert.equal(match("Rocky", rocky5).ok, false);
  assert.equal(match("Rocky V", rocky).ok, false);
  assert.equal(match("Rocky V", rocky5).ok, true);
});

test("un nombre qui fait partie du titre ne bloque rien", () => {
  // "2001" is the title, not a sequel number — a typo elsewhere must still pass.
  assert.equal(match("2001 a space odissey", odyssey).ok, true);
});

test("refuse un autre film du deck", () => {
  assert.equal(match("Parasite", shining).ok, false);
});

test("refuse quand un autre titre colle mieux", () => {
  // One edit from "Rocky", further from everything else in the deck.
  assert.equal(match("Rocky", shining).ok, false);
});

test("refuse un titre seulement approchant", () => {
  assert.equal(match("Shinobi", shining).ok, false);
  assert.equal(match("", shining).ok, false);
});

test("la signature numérique isole les nombres", () => {
  assert.equal(numericSignature("Scream 2"), "2");
  assert.equal(numericSignature("Rocky V"), "v");
  assert.equal(numericSignature("Shining"), "");
  // "Mix" reads as a Roman numeral under a general pattern; it must not here.
  assert.equal(numericSignature("Mix"), "");
});
