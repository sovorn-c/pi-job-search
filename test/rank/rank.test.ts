import assert from "node:assert/strict";
import test from "node:test";
import { rankJobs, weightedScore, type RankInput } from "../../src/rank.js";

const job = (overrides: Partial<RankInput> = {}): RankInput => ({
  job: { source: "test", id: "1", title: "Engineer", company: "Acme", location: "Copenhagen", datePosted: null, url: "https://example.com/1", description: "Build systems", employmentType: null },
  scores: { technical: 90, experience: 80, behavioral: 70, career: 60 },
  workRights: "PASS",
  location: "PASS",
  deadline: null,
  strengths: ["TypeScript"],
  gaps: ["Kubernetes"],
  ...overrides,
});

test("weighted rank arithmetic uses 30/25/15/30 dimensions", () => {
  assert.equal(weightedScore({ technical: 90, experience: 80, behavioral: 70, career: 60 }), 75.5);
  const result = rankJobs([job()], "2026-07-30");
  assert.equal(result.ranked[0].score, 75.5);
  assert.equal(result.ranked[0].verdict, "Strong Fit");
});

test("work-rights and location failures veto even excellent scores", () => {
  const result = rankJobs([
    job({ workRights: "FAIL" }),
    job({ job: { ...job().job, id: "2" }, location: "FAIL" }),
    job({ job: { ...job().job, id: "3" }, location: "FLAG" }),
  ], "2026-07-30");
  assert.equal(result.ranked.length, 1);
  assert.equal(result.ranked[0].locationGate, "FLAG");
  assert.deepEqual(result.excluded.map((entry) => entry.reason), ["work-rights-fail", "location-fail"]);
});

test("past deadlines expire and urgent deadlines win score ties", () => {
  const result = rankJobs([
    job({ job: { ...job().job, id: "later" }, deadline: "2026-08-15" }),
    job({ job: { ...job().job, id: "urgent" }, deadline: "2026-08-02" }),
    job({ job: { ...job().job, id: "past" }, deadline: "2026-07-29" }),
  ], "2026-07-30");
  assert.deepEqual(result.ranked.map((entry) => entry.id), ["urgent", "later"]);
  assert.equal(result.excluded[0].reason, "deadline-expired");
});
