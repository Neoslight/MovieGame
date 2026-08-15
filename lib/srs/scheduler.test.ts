import assert from "node:assert/strict";
import test from "node:test";
import { gradeFor, newCardState, Rating, review } from "./scheduler";

const DAY = 86_400_000;

test("les intervalles s'allongent avec les bonnes réponses", () => {
  let card = newCardState();
  let now = new Date("2026-01-01T10:00:00Z");
  const intervals: number[] = [];

  for (let i = 0; i < 12; i++) {
    card = review(card, Rating.Good, now);
    const gap = new Date(card.due).getTime() - now.getTime();
    intervals.push(gap);
    now = new Date(card.due);
  }

  // Beyond the two learning steps, every review must schedule further out —
  // until the 365-day ceiling, where fuzz makes it hover instead of grow.
  const reviewPhase = intervals.slice(2);
  const CEILING = 300 * DAY;
  for (let i = 1; i < reviewPhase.length; i++) {
    if (reviewPhase[i - 1] >= CEILING) break;
    assert.ok(
      reviewPhase[i] >= reviewPhase[i - 1],
      `intervalle ${i} (${reviewPhase[i] / DAY} j) < précédent (${reviewPhase[i - 1] / DAY} j)`,
    );
  }
  assert.ok(reviewPhase.at(-1)! > 30 * DAY, "après 10 réussites, l'échéance dépasse un mois");
});

test("un échec effondre la stabilité", () => {
  let card = newCardState();
  let now = new Date("2026-01-01T10:00:00Z");
  for (let i = 0; i < 8; i++) {
    card = review(card, Rating.Good, now);
    now = new Date(card.due);
  }
  const before = card.stability;

  card = review(card, Rating.Again, now);
  assert.ok(card.stability < before, "la stabilité doit chuter après un oubli");
  assert.ok(card.lapses === 1);
  assert.ok(new Date(card.due).getTime() - now.getTime() < DAY, "le film revient dans la session");
});

test("la note reflète justesse, vitesse et fautes de frappe", () => {
  assert.equal(gradeFor({ correct: true, distance: 0, elapsedMs: 1500 }), Rating.Easy);
  assert.equal(gradeFor({ correct: true, distance: 0, elapsedMs: 6000 }), Rating.Good);
  assert.equal(gradeFor({ correct: true, distance: 2, elapsedMs: 3000 }), Rating.Hard);
  assert.equal(gradeFor({ correct: true, distance: 0, elapsedMs: 20_000 }), Rating.Hard);
  assert.equal(gradeFor({ correct: false, distance: 9, elapsedMs: 3000 }), Rating.Again);
  assert.equal(
    gradeFor({ correct: true, distance: 0, elapsedMs: 1000, revealed: true }),
    Rating.Again,
  );
});
