import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChoices, CHOICE_COUNT } from "./choices";

interface P {
  id: number;
  name: string;
}
const p = (id: number, name: string): P => ({ id, name });

const kubrick = p(1, "Stanley Kubrick");
const POOL = [
  kubrick,
  p(2, "Martin Scorsese"),
  p(3, "Wes Anderson"),
  p(4, "Sofia Coppola"),
  p(5, "Pedro Almodóvar"),
  p(6, "Lars von Trier"),
];

// Deterministic: the test must not depend on Math.random.
const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
};

const build = (answer: P, pool: P[], excluded: P[] = []) =>
  buildChoices(answer, pool, (x) => x.id, (x) => x.name, {
    excluded,
    random: seeded(7),
  });

test("propose quatre options dont la bonne", () => {
  const choices = build(kubrick, POOL);
  assert.equal(choices.length, CHOICE_COUNT);
  assert.equal(choices.filter((c) => c.value.id === kubrick.id).length, 1);
});

test("la bonne réponse n'est jamais aussi un leurre", () => {
  for (let seed = 1; seed < 40; seed++) {
    const choices = buildChoices(kubrick, POOL, (x) => x.id, (x) => x.name, {
      random: seeded(seed),
    });
    assert.equal(choices.filter((c) => c.value.id === kubrick.id).length, 1);
  }
});

test("les autres bonnes réponses sont écartées des leurres", () => {
  // A co-director is also right, so offering them would make the question unfair.
  const coDirector = POOL[1];
  const choices = build(kubrick, POOL, [coDirector]);
  assert.ok(!choices.some((c) => c.value.id === coDirector.id));
});

test("deux options ne portent jamais le même libellé", () => {
  const twins = [kubrick, p(2, "Stanley Kubrick"), p(3, "Wes Anderson"), p(4, "Sofia Coppola")];
  const labels = build(kubrick, twins).map((c) => c.label);
  assert.equal(new Set(labels).size, labels.length);
});

test("la position de la bonne réponse varie", () => {
  const positions = new Set<number>();
  for (let seed = 1; seed < 30; seed++) {
    const choices = buildChoices(kubrick, POOL, (x) => x.id, (x) => x.name, {
      random: seeded(seed),
    });
    positions.add(choices.findIndex((c) => c.value.id === kubrick.id));
  }
  assert.ok(positions.size > 1, "la bonne réponse tombe toujours au même endroit");
});

test("un vivier trop petit rend moins d'options, sans planter", () => {
  const choices = build(kubrick, [kubrick, POOL[1]]);
  assert.equal(choices.length, 2);
  assert.ok(choices.some((c) => c.value.id === kubrick.id));
});
