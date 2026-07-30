import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkProfileConsistency, writeProfileSection } from "../../src/profile.js";

test("consistency diagnostics identify missing and inferred profile facts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  await writeProfileSection(cwd, "candidate", { name: "Ada" }, { source: "cv", kind: "cv" }, 0);
  await writeProfileSection(cwd, "behavioral", { style: "deliberate" }, { source: "linkedin", kind: "document" }, 0, "inferred");
  const report = await checkProfileConsistency(cwd);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.type === "missing" && issue.section === "search"));
  assert.ok(report.issues.some((issue) => issue.type === "inferred"));
});
