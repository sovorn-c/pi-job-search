import assert from "node:assert/strict";
import test from "node:test";
import { getGmailCredentialStatus, redactSecrets, type GmailClient } from "../../src/gmail.js";

test("Gmail credentials are presence-only and redacted", () => {
  const token = "ya29.super-secret-token";
  const status = getGmailCredentialStatus({ GMAIL_TOKEN: token });
  assert.deepEqual(status, { configured: true, source: "GMAIL_TOKEN" });
  const output = JSON.stringify({ status, diagnostic: redactSecrets({ token, Authorization: `Bearer ${token}` }, [token]) });
  assert.doesNotMatch(output, /super-secret-token/);
});

test("connector contract exposes read-only list/get operations", () => {
  const client: GmailClient = { async list() { return { messages: [], nextPageToken: undefined }; }, async get() { throw new Error("unused"); } };
  assert.equal(typeof client.list, "function");
  assert.equal(typeof client.get, "function");
  assert.equal("send" in client, false);
  assert.equal("delete" in client, false);
});
