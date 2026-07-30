import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableApplicationKey, writeTracker, readTracker } from "../src/tracker.ts";
import { createGmailClient } from "../src/gmail.ts";
import { syncGmail } from "../src/gmail-sync.ts";

const encode = (value) => Buffer.from(value).toString("base64url");
const message = (id, subject, text) => ({ id, internalDate: "1722326400000", payload: { mimeType: "text/plain", body: { data: encode(text) }, headers: [{ name: "Subject", value: subject }, { name: "Date", value: "Tue, 30 Jul 2024 12:00:00 +0000" }] } });
const root = await mkdtemp(join(tmpdir(), "pi-gmail-acceptance-"));
try {
  const row = { applicationKey: stableApplicationKey("Acme", "Engineer"), company: "Acme", role: "Engineer", url: "https://acme.example/job", status: "applied" };
  await writeTracker(root, [row]);
  const messages = [message("ack", "Application received", "We received your application."), message("offer", "Offer from Acme", "We are pleased to offer you the Engineer role at Acme.")];
  const fake = { async list() { return { messages: messages.map(({ id }) => ({ id })) }; }, async get(id) { return messages.find((item) => item.id === id); } };
  const preview = await syncGmail(root, fake, {});
  assert.equal(preview.proposals.length, 1);
  assert.equal((await readTracker(root))[0].status, "applied");
  const rejected = await syncGmail(root, fake, { confirmation: "REJECT" });
  assert.deepEqual(rejected.applied, []);
  assert.equal((await readTracker(root))[0].status, "applied");
  const replay = await syncGmail(root, fake, {});
  assert.equal(replay.proposals.length, 0);
  const fresh = await mkdtemp(join(tmpdir(), "pi-gmail-approve-"));
  try {
    await writeTracker(fresh, [row]);
    const approved = await syncGmail(fresh, fake, { confirmation: "APPROVE" });
    assert.deepEqual(approved.applied, [row.applicationKey]);
    assert.equal((await readTracker(fresh))[0].status, "offer");
    assert.equal((await readFile(join(fresh, ".pi-job-search/applications/acme_engineer/outcome.md"), "utf8")).includes("offer"), true);
  } finally { await rm(fresh, { recursive: true, force: true }); }
  assert.deepEqual(createGmailClient({}).credentials, { configured: false, source: null });
  console.log("Gmail integration verification passed");
} finally { await rm(root, { recursive: true, force: true }); }
