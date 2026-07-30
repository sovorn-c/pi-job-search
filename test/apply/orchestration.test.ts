import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApplicationWorkspace, planApplication, type ApplicationInput } from "../../src/apply.js";

const evaluation = { eligible: true, blocking: [], requirements: [], gaps: [], postingText: "Required: TypeScript" };
const input = (root: string, overrides: Partial<ApplicationInput> = {}): ApplicationInput => ({
  cwd: root,
  company: "Acme / Dangerous",
  title: "Senior Engineer",
  url: "https://example.com/jobs/1",
  postingText: "Required: TypeScript",
  evaluation,
  claims: [{ id: "claim", key: "years", value: 8, text: "8 years of experience", factIds: ["fact"] }],
  facts: [{ id: "fact", key: "years", value: 8, source: "approved-profile", provenance: "profile/candidate.json" }],
  confirmation: "PROCEED",
  ...overrides,
});

test("application planning requires explicit proceed and never submits", () => {
  assert.deepEqual(planApplication({ ...input("/tmp"), confirmation: undefined }), { status: "confirmation-required" });
  assert.deepEqual(planApplication({ ...input("/tmp"), evaluation: { ...evaluation, eligible: false, blocking: ["work-rights-fail"] } }), { status: "blocked", reason: "work-rights-fail" });
  assert.equal(planApplication(input("/tmp")).status, "ready");
});

test("approved application creates a sanitized archive and preserves immutable posting capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-job-apply-"));
  try {
    const first = await createApplicationWorkspace(input(root));
    assert.match(first.directory, /Acme_Dangerous_Senior_Engineer/);
    assert.equal(await readFile(join(first.directory, "job-posting.md"), "utf8"), "# Senior Engineer at Acme / Dangerous\n\nURL: https://example.com/jobs/1\n\nRequired: TypeScript\n");
    await createApplicationWorkspace(input(root, { postingText: "tampered" }));
    assert.match(await readFile(join(first.directory, "job-posting.md"), "utf8"), /Required: TypeScript/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
