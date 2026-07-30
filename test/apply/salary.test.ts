import assert from "node:assert/strict";
import test from "node:test";
import { lookupSalaryBenchmark, validateSalaryData } from "../../src/salary.js";

test("salary benchmark is source-labelled and optional", () => {
  const data = validateSalaryData([{ role: "Software Engineer", location: "Copenhagen", currency: "DKK", min: 60000, max: 80000, source: "salary.example", updatedAt: "2026-07-01" }]);
  assert.equal(data.valid, true);
  const result = lookupSalaryBenchmark(data.records, "software engineer", "Copenhagen");
  assert.deepEqual(result, { status: "available", currency: "DKK", min: 60000, max: 80000, midpoint: 70000, source: "salary.example", updatedAt: "2026-07-01" });
});

test("missing or malformed local salary data skips without throwing", () => {
  const invalid = validateSalaryData([{ role: "", currency: "DKK", min: -1, max: 2, source: "" }]);
  assert.equal(invalid.valid, false);
  assert.equal(lookupSalaryBenchmark([], "engineer", "Copenhagen").status, "skipped");
  assert.equal(lookupSalaryBenchmark(invalid.records, "engineer", "Copenhagen").status, "skipped");
});
