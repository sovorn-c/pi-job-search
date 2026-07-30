import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { draftFollowup } from "../../src/followup.js";

test("thank-you and follow-up drafts use approved facts and cap at two", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-followup-"));
  try {
    const input = { cwd: root, applicationKey: "acme_role", company: "Acme", role: "Engineer", date: "2026-07-30", facts: ["TypeScript"], requestedClaims: ["TypeScript"] };
    const first = await draftFollowup({ ...input, kind: "thank-you", existingCount: 0 });
    assert.match(await readFile(first.path, "utf8"), /Thank you/);
    await draftFollowup({ ...input, kind: "follow-up", date: "2026-08-06", existingCount: 1 });
    await assert.rejects(() => draftFollowup({ ...input, kind: "follow-up", date: "2026-08-13", existingCount: 2 }), /two follow-ups/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unsupported claims are blocked and drafts never contain send instructions", async () => {
  await assert.rejects(() => draftFollowup({ cwd: "/tmp", applicationKey: "acme_role", company: "Acme", role: "Engineer", date: "2026-07-30", kind: "thank-you", facts: ["TypeScript"], requestedClaims: ["Top Secret clearance"], existingCount: 0 }), /unsupported claim/);
});
