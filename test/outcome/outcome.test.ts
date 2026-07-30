import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { recordOutcome, selectApplication } from "../../src/outcome.js";
import { writeTracker, type TrackerRow } from "../../src/tracker.js";

const row: TrackerRow = { applicationKey: "acme_engineer", company: "Acme", role: "Engineer", url: "https://acme.example/job", status: "applied" };

test("outcome selection and updates preserve tracker state and history", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-outcome-"));
  try {
    await writeTracker(root, [row]);
    const selected = await selectApplication(root, "Acme", "Engineer");
    assert.equal(selected.applicationKey, "acme_engineer");
    await recordOutcome(root, { applicationKey: row.applicationKey, date: "2026-07-30", stage: "acknowledged", status: "acknowledged", decision: "pending", evidence: "email", notes: "Received reply" });
    await recordOutcome(root, { applicationKey: row.applicationKey, date: "2026-08-01", stage: "offer", status: "offer", decision: "pending", evidence: "offer letter", notes: "Review terms" });
    const tracker = await (await import("../../src/tracker.js")).readTracker(root);
    assert.equal(tracker[0].status, "offer");
    assert.match(await readFile(join(root, ".pi-job-search/applications/acme_engineer/outcome.md"), "utf8"), /Received reply[\s\S]*Review terms/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("selection rejects unknown or ambiguous applications", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-outcome-select-"));
  try {
    await writeTracker(root, [row, { ...row, applicationKey: "acme_other", role: "Other" }]);
    await assert.rejects(() => selectApplication(root, "Missing", "Role"), /application not found/);
    await assert.rejects(() => selectApplication(root, "Acme"), /multiple applications/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
