import assert from "node:assert/strict";
import assertStrict from "node:assert/strict";
import test from "node:test";
import { diffReports, type AggregateReport } from "../../src/upskill.js";

const report = (texts: string[]): AggregateReport => ({ gaps: texts.map((text) => ({ text, normalized: text.toLowerCase(), frequency: 1, weight: 1, priority: 3 as const, roles: ["Role"] })), learningPlan: [], generatedAt: "2026-07-30" });

test("upskill diff reports added, resolved, and persisting gaps", () => {
  const diff = diffReports(report(["TypeScript", "PostgreSQL"]), report(["TypeScript", "Rust"]));
  assert.deepEqual(diff.added, ["rust"]);
  assert.deepEqual(diff.resolved, ["postgresql"]);
  assert.deepEqual(diff.persisting, ["typescript"]);
  assertStrict.equal(diff.previousDate, "2026-07-30");
});
