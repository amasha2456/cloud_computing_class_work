import { test } from "node:test";
import assert from "node:assert/strict";
import { hasEnoughSeats, isBelowThreshold } from "./seat-logic.js";

test("hasEnoughSeats: allows a request within remaining capacity", () => {
  assert.strictEqual(hasEnoughSeats(2, 15), true);
});

test("hasEnoughSeats: allows a request that exactly matches remaining capacity", () => {
  assert.strictEqual(hasEnoughSeats(15, 15), true);
});

test("hasEnoughSeats: rejects a request exceeding remaining capacity", () => {
  // The exact bug scenario debugged this session: 15 available, 20 requested.
  assert.strictEqual(hasEnoughSeats(20, 15), false);
});

test("isBelowThreshold: seats above threshold do not trigger the low-seats alert", () => {
  assert.strictEqual(isBelowThreshold(15, 10), false);
});

test("isBelowThreshold: seats exactly at threshold do not trigger the alert", () => {
  assert.strictEqual(isBelowThreshold(10, 10), false);
});

test("isBelowThreshold: seats below threshold trigger the alert", () => {
  assert.strictEqual(isBelowThreshold(6, 10), true);
});

test("isBelowThreshold: zero remaining seats triggers the alert", () => {
  assert.strictEqual(isBelowThreshold(0, 10), true);
});
