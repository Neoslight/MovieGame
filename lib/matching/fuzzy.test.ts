import assert from "node:assert/strict";
import test from "node:test";
import { matchAnswer } from "./fuzzy";
import type { Person } from "../types";

let nextId = 1;
const p = (name: string, aliases: string[] = []): Person => ({
  tmdbId: nextId++,
  name,
  profilePath: null,
  aliases,
});

const scorsese = p("Martin Scorsese");
const kubrick = p("Stanley Kubrick");
const wes = p("Wes Anderson");
const pta = p("Paul Thomas Anderson");
const coppola = p("Francis Ford Coppola");
const sofia = p("Sofia Coppola");
const almodovar = p("Pedro Almodóvar");
const vonTrier = p("Lars von Trier");
const bong = p("Bong Joon-ho", ["Joon-ho Bong", "Bong Joon Ho"]);
const coen = p("Joel Coen");

const DECK = [scorsese, kubrick, wes, pta, coppola, sofia, almodovar, vonTrier, bong, coen];
const match = (input: string, targets: Person[]) =>
  matchAnswer(input, targets, { corpus: DECK });

test("accepte la réponse exacte", () => {
  assert.equal(match("Martin Scorsese", [scorsese]).ok, true);
});

test("ignore casse, accents et ponctuation", () => {
  assert.equal(match("pedro almodovar", [almodovar]).ok, true);
  assert.equal(match("PEDRO ALMODÓVAR", [almodovar]).ok, true);
});

test("pardonne les fautes de frappe courantes", () => {
  for (const typo of ["scorcese", "martin scorcese", "scorsesse", "martin scorsee"]) {
    assert.equal(match(typo, [scorsese]).ok, true, typo);
  }
  assert.equal(match("kubrcik", [kubrick]).ok, true); // transposition
});

test("accepte le nom de famille seul quand il est unique", () => {
  const r = match("kubrick", [kubrick]);
  assert.equal(r.ok, true);
  assert.equal(r.kind, "surname");
});

test("refuse un nom de famille ambigu dans le deck", () => {
  const r = match("anderson", [wes]);
  assert.equal(r.ok, false);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.ambiguousWith?.sort(), ["Paul Thomas Anderson", "Wes Anderson"]);

  const c = match("coppola", [sofia]);
  assert.equal(c.ok, false);
  assert.equal(c.kind, "ambiguous");
});

test("accepte le prénom + nom quand le nom seul serait ambigu", () => {
  assert.equal(match("wes anderson", [wes]).ok, true);
  assert.equal(match("sofia coppola", [sofia]).ok, true);
});

test("accepte la particule présente ou absente", () => {
  assert.equal(match("lars von trier", [vonTrier]).ok, true);
  assert.equal(match("von trier", [vonTrier]).ok, true);
  assert.equal(match("trier", [vonTrier]).ok, true);
});

test("accepte les ordres de noms alternatifs via alias", () => {
  assert.equal(match("joon-ho bong", [bong]).ok, true);
  assert.equal(match("bong joon ho", [bong]).ok, true);
});

test("refuse une autre personne du deck", () => {
  assert.equal(match("stanley kubrick", [scorsese]).ok, false);
  assert.equal(match("wes anderson", [pta]).ok, false);
});

test("refuse quand une autre personne colle mieux", () => {
  // "sofia coppol" is one edit from Sofia Coppola, so it must not pass for Francis.
  assert.equal(match("sofia coppol", [coppola]).ok, false);
});

test("refuse une réponse trop éloignée", () => {
  assert.equal(match("spielberg", [scorsese]).ok, false);
  assert.equal(match("scor", [scorsese]).ok, false);
  assert.equal(match("", [scorsese]).ok, false);
});

test("tolérance proportionnelle à la longueur", () => {
  // "Coen" is 4 letters, so one edit passes and two do not.
  assert.equal(match("cohen", [coen]).ok, true);
  assert.equal(match("cohan", [coen]).ok, false);

  // "Almodóvar" is long enough to absorb three.
  assert.equal(match("almadovar", [almodovar]).ok, true);
  assert.equal(match("almodovarez", [almodovar]).ok, true);
  assert.equal(match("almo", [almodovar]).ok, false);
});

test("accepte n'importe lequel des co-réalisateurs", () => {
  const ethan = p("Ethan Coen");
  const targets = [coen, ethan];
  assert.equal(matchAnswer("ethan coen", targets, { corpus: [...DECK, ethan] }).ok, true);
  assert.equal(matchAnswer("joel coen", targets, { corpus: [...DECK, ethan] }).ok, true);
});
