import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePosting, extractRequirements } from "../../src/apply.js";

test("evaluation inventories requirements and reports candidate gaps", () => {
  const requirements = extractRequirements("Required: TypeScript\nRequired: Kubernetes\nNice to have: AWS");
  const evaluation = evaluatePosting({
    postingText: "Senior engineer",
    workRights: "PASS",
    location: "PASS",
    requirements,
    candidateSkills: ["typescript"],
  });
  assert.equal(evaluation.eligible, true);
  assert.deepEqual(evaluation.requirements.map((item) => item.status), ["met", "gap", "gap"]);
  assert.deepEqual(evaluation.gaps.map((item) => item.text), ["Kubernetes", "AWS"]);
});

test("work-rights failure blocks evaluation before requirements become actionable", () => {
  const evaluation = evaluatePosting({
    postingText: "Required: TypeScript",
    workRights: "FAIL",
    location: "PASS",
    requirements: extractRequirements("Required: TypeScript"),
    candidateSkills: ["typescript"],
  });
  assert.equal(evaluation.eligible, false);
  assert.deepEqual(evaluation.blocking, ["work-rights-fail"]);
});
