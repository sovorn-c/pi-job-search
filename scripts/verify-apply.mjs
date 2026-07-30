import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankJobs, mergeRankState } from "../src/rank.ts";
import { createApplicationWorkspace, evaluatePosting, extractRequirements } from "../src/apply.ts";
import { verifyDocument } from "../src/documents.ts";

const root = await mkdtemp(join(tmpdir(), "pi-job-apply-acceptance-"));
try {
  const base = { source: "fixture", title: "TypeScript Engineer", company: "Acme", location: "Copenhagen", datePosted: null, url: "https://acme.example/jobs/1", description: "Build TypeScript systems", employmentType: null };
  const result = rankJobs([
    { job: { ...base, id: "eligible" }, scores: { technical: 90, experience: 80, behavioral: 70, career: 80 }, workRights: "PASS", location: "PASS", deadline: null, strengths: ["TypeScript"], gaps: [] },
    { job: { ...base, id: "ineligible" }, scores: { technical: 100, experience: 100, behavioral: 100, career: 100 }, workRights: "FAIL", location: "PASS", deadline: null, strengths: [], gaps: [] },
  ], "2026-07-30");
  assert.equal(result.ranked[0].score, 81.5);
  assert.equal(result.excluded[0].reason, "work-rights-fail");
  const state = mergeRankState({}, [{ id: "eligible", score: result.ranked[0].score, verdict: result.ranked[0].verdict, rankDate: result.ranked[0].rankDate, status: "ranked" }]);
  assert.equal(state.eligible.status, "ranked");

  const evaluation = evaluatePosting({ postingText: base.description, workRights: "PASS", location: "PASS", requirements: extractRequirements("Required: TypeScript"), candidateSkills: ["TypeScript"] });
  await createApplicationWorkspace({ cwd: root, company: base.company, title: base.title, url: base.url, postingText: "Required: TypeScript", evaluation, claims: [{ id: "claim", key: "skill", value: "TypeScript", text: "TypeScript", factIds: ["fact"] }], facts: [{ id: "fact", key: "skill", value: "TypeScript", source: "approved-profile", provenance: "profile/candidate.json" }], confirmation: "PROCEED" });
  assert.match(await readFile(join(root, ".pi-job-search/applications/Acme_TypeScript_Engineer/job-posting.md"), "utf8"), /acme\.example/);
  const verified = await verifyDocument({ pdfPath: "/tmp/fixture.pdf", expectedPages: 2, requiredText: ["Candidate"], forbiddenText: ["TODO"], keywords: ["TypeScript"] }, async (command) => command === "pdfinfo" ? { stdout: "Pages: 2", stderr: "" } : { stdout: "Candidate\nTypeScript", stderr: "" });
  assert.equal(verified.passed, true);
  console.log("apply verification passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
