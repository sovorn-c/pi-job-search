import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readTracker, stableApplicationKey, writeTracker, type TrackerRow } from "../../src/tracker.js";
import { classifyGmailMessage, readGmailState, syncGmail, type GmailSyncClient, type GmailSyncMessage } from "../../src/gmail-sync.js";

const body = (text: string) => Buffer.from(text).toString("base64url");
function message(id: string, subject: string, text: string): GmailSyncMessage {
  return { id, internalDate: "1722326400000", payload: { mimeType: "text/plain", body: { data: body(text) }, headers: [{ name: "Subject", value: subject }, { name: "Date", value: "Tue, 30 Jul 2024 12:00:00 +0000" }] } };
}
function client(messages: GmailSyncMessage[]): GmailSyncClient {
  return { async list() { return { messages: messages.map((item) => ({ id: item.id })) }; }, async get(id) { return messages.find((item) => item.id === id)!; } };
}

async function setup(): Promise<{ root: string; row: TrackerRow }> {
  const root = await mkdtemp(join(tmpdir(), "pi-gmail-sync-"));
  const row = { applicationKey: stableApplicationKey("Acme", "Engineer"), company: "Acme", role: "Engineer", url: "https://acme.example/job", status: "applied" as const };
  await writeTracker(root, [row]);
  return { root, row };
}

test("Gmail sync classifies full messages and previews without mutating local state", async () => {
  const { root, row } = await setup();
  const messages = [message("ack", "Application received", "Thank you, we received your application."), message("interview", "Interview invitation — Acme", "Acme would like to schedule an interview for the Engineer role."), message("offer", "Offer from Acme", "We are pleased to offer you the Engineer role at Acme.")];
  try {
    assert.equal(classifyGmailMessage(messages[0]), "acknowledgement");
    assert.equal(classifyGmailMessage(messages[1]), "interview");
    assert.equal(classifyGmailMessage(messages[2]), "offer");
    const result = await syncGmail(root, client(messages), { query: "Acme" });
    assert.equal(result.needsApproval, true);
    assert.equal(result.proposals.length, 2);
    assert.deepEqual(await readTracker(root), [row]);
    await assert.rejects(() => readFile(join(root, ".pi-job-search/integrations/gmail.json")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejected batches persist processed IDs and replay produces no proposals", async () => {
  const { root } = await setup();
  const messages = [message("interview", "Interview invitation — Acme", "Acme would like to schedule an interview for the Engineer role.")];
  try {
    const rejected = await syncGmail(root, client(messages), { confirmation: "REJECT" });
    assert.deepEqual(rejected.applied, []);
    assert.deepEqual((await readGmailState(root)).processedIds, ["interview"]);
    const replay = await syncGmail(root, client(messages), {});
    assert.deepEqual(replay.proposals, []);
    assert.equal(replay.processedCount, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("approved offers and interviews update only matched applications; ambiguous matches stay proposals", async () => {
  const { root, row } = await setup();
  const messages = [message("interview", "Interview invitation — Acme", "Acme would like to schedule an interview for the Engineer role."), message("ambiguous", "Interview invitation — Acme", "Acme would like to schedule an interview.")];
  try {
    const result = await syncGmail(root, client(messages), { confirmation: "APPROVE" });
    assert.deepEqual(result.applied, [row.applicationKey]);
    assert.equal(result.proposals.some((proposal) => proposal.messageId === "ambiguous" && proposal.ambiguous), true);
    assert.equal((await readTracker(root))[0].status, "interview");
    assert.equal((await readGmailState(root)).processedIds.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("missing authorization is a no-op", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-gmail-no-auth-"));
  try {
    const result = await syncGmail(root, undefined, {});
    assert.equal(result.authorized, false);
    assert.deepEqual(result.proposals, []);
    await assert.rejects(() => readFile(join(root, ".pi-job-search/integrations/gmail.json")));
  } finally { await rm(root, { recursive: true, force: true }); }
});
