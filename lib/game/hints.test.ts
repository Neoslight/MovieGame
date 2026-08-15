import assert from "node:assert/strict";
import { test } from "node:test";
import { capGrade, hintFor, MAX_HINT_LEVEL, maxGradeAfterHints } from "./hints";
import { Rating } from "../srs/scheduler";

test("le premier indice ne donne que les initiales", () => {
  // The bullet count is the letter count: the length is part of the hint.
  assert.equal(hintFor("Stanley Kubrick", 1), "S•••••• K••••••");
  assert.equal(hintFor("Bong Joon-ho", 1), "B••• J••••••");
});

test("le deuxième indice donne le prénom", () => {
  assert.equal(hintFor("Stanley Kubrick", 2), "Stanley K••••••");
});

test("le dernier indice en découvre un peu plus, sans donner le nom", () => {
  const last = hintFor("Stanley Kubrick", MAX_HINT_LEVEL);
  assert.equal(last, "Stanley Kub••••");
  assert.ok(last.includes("•"), "le nom ne doit jamais être complet");
});

test("un nom d'un seul mot reste masqué jusqu'au bout", () => {
  assert.equal(hintFor("Kubrick", 1), "K••••••");
  const last = hintFor("Kubrick", MAX_HINT_LEVEL);
  assert.ok(last.startsWith("Kub"));
  assert.ok(last.includes("•"));
});

test("un mot très court ne peut pas être entièrement dévoilé", () => {
  // "Coen" would be handed over outright by a fixed three-letter reveal.
  const last = hintFor("Joel Coen", MAX_HINT_LEVEL);
  assert.ok(last.includes("•"), `« ${last} » donne la réponse`);
});

test("l'échelle marche aussi sur un titre", () => {
  assert.equal(hintFor("Blade Runner", 1), "B•••• R•••••");
  assert.equal(hintFor("Blade Runner", 2), "Blade R•••••");
});

test("aucun indice, aucune entrée", () => {
  assert.equal(hintFor("Stanley Kubrick", 0), "");
  assert.equal(hintFor("", 1), "");
});

test("chaque indice abaisse le plafond de note", () => {
  assert.equal(maxGradeAfterHints(0), Rating.Easy);
  assert.equal(maxGradeAfterHints(1), Rating.Good);
  assert.equal(maxGradeAfterHints(2), Rating.Hard);
  assert.equal(maxGradeAfterHints(3), Rating.Hard);
});

test("le plafond n'améliore jamais une note", () => {
  // A hesitant answer stays Hard even with no hint taken.
  assert.equal(capGrade(Rating.Hard, 0), Rating.Hard);
  assert.equal(capGrade(Rating.Easy, 0), Rating.Easy);
  // And a perfect answer is brought down by the hints it needed.
  assert.equal(capGrade(Rating.Easy, 1), Rating.Good);
  assert.equal(capGrade(Rating.Easy, 2), Rating.Hard);
  assert.equal(capGrade(Rating.Good, 2), Rating.Hard);
});
