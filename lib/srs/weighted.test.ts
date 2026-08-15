import assert from "node:assert/strict";
import { test } from "node:test";
import { pickOverdue, pickWeighted } from "./weighted";

const card = (popularity: number) => ({ popularity });

test("empty pool yields nothing", () => {
  assert.equal(pickWeighted([]), undefined);
});

test("the ticket lands on the item whose weight covers it", () => {
  const items = [card(0), card(0), card(0)];
  // Three equal weights of 0.5 → cumulative 0.5 / 1.0 / 1.5.
  assert.equal(pickWeighted(items, () => 0), items[0]);
  assert.equal(pickWeighted(items, () => 0.5), items[1]);
  assert.equal(pickWeighted(items, () => 0.99), items[2]);
});

test("a blockbuster is favoured but nowhere near guaranteed", () => {
  // One trending film against a hundred ordinary ones — the shape of the real
  // deck, where a hard sort on popularity served Marvel twenty times running.
  const items = [card(500), ...Array.from({ length: 100 }, () => card(4))];

  let blockbuster = 0;
  let seed = 12345;
  const rng = () => {
    // Deterministic LCG: the test must not depend on Math.random.
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 2000; i++) {
    if (pickWeighted(items, rng) === items[0]) blockbuster++;
  }

  const share = blockbuster / 2000;
  assert.ok(share > 0.02, `trop rare : ${share}`);
  assert.ok(share < 0.15, `trop dominant : ${share}`);
});

test("nothing due yields nothing", () => {
  assert.equal(pickOverdue([]), undefined);
});

test("the overdue pick roams the window instead of always taking the oldest", () => {
  const due = Array.from({ length: 100 }, (_, i) => i);
  assert.equal(pickOverdue(due, () => 0), 0);
  assert.equal(pickOverdue(due, () => 0.5), 15);
  // The window is 30 cards: nothing past it is ever served while it is full.
  assert.equal(pickOverdue(due, () => 0.999), 29);
});

test("a short queue is still fully covered", () => {
  const due = [0, 1, 2];
  assert.equal(pickOverdue(due, () => 0.999), 2);
  assert.equal(pickOverdue(due, () => 0), 0);
});

test("popularity 0 stays reachable", () => {
  const items = [card(400), card(0)];
  let hits = 0;
  for (let i = 0; i < 500; i++) {
    if (pickWeighted(items, () => 0.999) === items[1]) hits++;
  }
  assert.equal(hits, 500);
});
