import assert from "node:assert/strict";
import test from "node:test";
import { GmailApiClient, extractMessageText, getFullMessages, getMessageHeader, listAllMessages, type GmailMessage } from "../../src/gmail.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("Gmail client paginates lists and retrieves full messages with read-only authorization", async () => {
  const calls: Array<{ url: string; auth: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), auth: String(new Headers(init?.headers).get("authorization")) });
    return String(input).includes("pageToken=next") ? jsonResponse({ messages: [{ id: "two" }] }) : jsonResponse({ messages: [{ id: "one" }], nextPageToken: "next" });
  };
  const client = new GmailApiClient("secret-token", fetchImpl, "https://gmail.test/v1");
  const refs = await listAllMessages(client, "from:jobs@example.com");
  assert.deepEqual(refs.map((ref) => ref.id), ["one", "two"]);
  assert.equal(calls[0].auth, "Bearer secret-token");
  assert.match(calls[0].url, /q=from%3Ajobs%40example.com/);
});

test("full-message MIME extraction prefers plain text and reads headers", async () => {
  const plain = Buffer.from("Interview invitation for Engineer").toString("base64url");
  const message: GmailMessage = { id: "one", payload: { headers: [{ name: "Subject", value: "Interview" }], mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: Buffer.from("<b>ignored</b>").toString("base64url") } }, { mimeType: "text/plain", body: { data: plain } }] } };
  const client = { async list() { return { messages: [] }; }, async get() { return message; } };
  assert.deepEqual(await getFullMessages(client, [{ id: "one" }]), [message]);
  assert.equal(extractMessageText(message), "Interview invitation for Engineer");
  assert.equal(getMessageHeader(message, "subject"), "Interview");
});

test("message retrieval rejects non-success responses without exposing response content", async () => {
  const client = new GmailApiClient("secret", async () => new Response("token=secret", { status: 401 }), "https://gmail.test/v1");
  await assert.rejects(() => client.get("one"), /status 401/);
  await assert.rejects(() => client.get("../secret"), /invalid Gmail message id/);
});
