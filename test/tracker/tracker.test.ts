import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readTracker, stableApplicationKey, upsertTrackerRow, writeTracker, type TrackerRow } from "../../src/tracker.js";

const row: TrackerRow = { applicationKey: "acme_senior_engineer", company: "Acme", role: "Senior Engineer", url: "https://acme.example/job", status: "applied", notes: "Asked about comma, and\nmultiple lines" };

test("CSV round-trip preserves quoted commas and multiline fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-tracker-"));
  try {
    await writeTracker(root, [row]);
    assert.deepEqual(await readTracker(root), [row]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("application key is stable and upsert is idempotent", () => {
  assert.equal(stableApplicationKey("Acme / Co", "Senior Engineer"), "acme_co_senior_engineer");
  assert.equal(upsertTrackerRow([row], row).length, 1);
  assert.equal(upsertTrackerRow([], row)[0].applicationKey, row.applicationKey);
});
