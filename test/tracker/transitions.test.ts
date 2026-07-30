import assert from "node:assert/strict";
import test from "node:test";
import { canTransition, transitionStatus } from "../../src/tracker.js";

test("allowed status transitions follow the application lifecycle", () => {
  assert.equal(canTransition("applied", "acknowledged"), true);
  assert.equal(canTransition("acknowledged", "interview"), true);
  assert.equal(canTransition("interview", "offer"), true);
  assert.equal(canTransition("offer", "hired"), true);
  assert.equal(canTransition("offer", "rejected"), false);
  assert.equal(canTransition("hired", "applied"), false);
});

test("invalid transitions throw and same-status updates are idempotent", () => {
  assert.equal(transitionStatus("applied", "applied"), "applied");
  assert.throws(() => transitionStatus("hired", "rejected"), /invalid status transition/);
});
