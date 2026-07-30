import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applySetupPlan,
  buildSetupPlan,
  readProfileSection,
  setupFromCv,
  setupFromDocuments,
  setupFromInterview,
} from "../../src/profile.js";

test("CV, interview, and document setup converge on approved canonical facts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const plan = await setupFromCv(cwd, { name: "Ada Lovelace", skills: ["math"] }, "resume.pdf");
  assert.equal(plan.additions.length, 2);
  assert.equal(plan.written, false);

  const result = await applySetupPlan(cwd, plan, { approve: ["name", "skills"] });
  assert.equal(result.written, true);
  const section = await readProfileSection(cwd, "candidate");
  assert.equal(section.fields.name.value, "Ada Lovelace");
  assert.equal(section.fields.name.provenance[0].source, "resume.pdf");
});

test("document and interview setup paths use the same fact model", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const documentPlan = await setupFromDocuments(cwd, { education: "Oxford" }, "diploma.txt");
  assert.equal(documentPlan.additions[0].incoming.provenance[0].kind, "document");
  const interviewPlan = await setupFromInterview(cwd, { goals: ["research"] });
  assert.equal(interviewPlan.additions[0].incoming.provenance[0].kind, "interview");
});

test("conflicts are preserved until explicitly resolved", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const first = buildSetupPlan("candidate", { name: "Ada" }, { source: "cv.md", kind: "cv" }, {});
  await applySetupPlan(cwd, first, { approve: ["name"] });
  const second = buildSetupPlan("candidate", { name: "Augusta" }, { source: "linkedin.txt", kind: "document" }, await readProfileSection(cwd, "candidate"));
  assert.equal(second.conflicts.length, 1);
  const denied = await applySetupPlan(cwd, second, { approve: [] });
  assert.equal(denied.written, false);
  assert.equal((await readProfileSection(cwd, "candidate")).fields.name.value, "Ada");
});
