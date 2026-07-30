import assert from "node:assert/strict";
import test from "node:test";
import { aggregateGaps, type RoleGapInput } from "../../src/upskill.js";

test("aggregate weighting prioritizes repeated required gaps and role importance", () => {
  const roles: RoleGapInput[] = [
    { applicationKey: "a", role: "Senior", importance: 2, gaps: [{ text: "PostgreSQL", priority: 3 }, { text: "Kubernetes", priority: 1 }] },
    { applicationKey: "b", role: "Engineer", importance: 1, gaps: [{ text: "PostgreSQL", priority: 3 }] },
    { applicationKey: "c", role: "Other", importance: 1, gaps: [{ text: "Rust", priority: 3 }] },
  ];
  const report = aggregateGaps(roles);
  assert.equal(report.gaps[0].text, "PostgreSQL");
  assert.equal(report.gaps[0].frequency, 2);
  assert.deepEqual(report.gaps[0].roles, ["Senior", "Engineer"]);
  assert.equal(report.learningPlan[0].text, "PostgreSQL");
});
