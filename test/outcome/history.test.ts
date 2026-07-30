import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendOutcomeHistory } from "../../src/archive.js";

test("outcome history is append-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-history-"));
  try {
    await appendOutcomeHistory(root, "acme_role", { date: "2026-07-30", stage: "acknowledged", status: "acknowledged", decision: "pending", evidence: "reply", notes: "Thanks" });
    await appendOutcomeHistory(root, "acme_role", { date: "2026-08-01", stage: "interview", status: "interview", decision: "pending", evidence: "calendar", notes: "Technical round" });
    const history = await readFile(join(root, ".pi-job-search/applications/acme_role/outcome.md"), "utf8");
    assert.match(history, /acknowledged/);
    assert.match(history, /interview/);
    assert.ok(history.indexOf("acknowledged") < history.indexOf("interview"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
