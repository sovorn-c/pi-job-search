import assert from "node:assert/strict";
import test from "node:test";
import { authorizeGmail, createAuthorizedGmailClient, createPkcePair, refreshGmailAccessToken, type OAuthTokenStore } from "../../src/gmail-oauth.js";

class MemoryStore implements OAuthTokenStore {
  value: string | null = null;
  async load() { return this.value; }
  async save(value: string) { this.value = value; }
}

test("PKCE authorization validates state, exchanges the code, and stores only the refresh token", async () => {
  const store = new MemoryStore();
  let opened = "";
  const result = await authorizeGmail({
    clientId: "client-id",
    clientSecret: "client-secret",
    store,
    timeoutMs: 2_000,
    openBrowser: async (url) => {
      opened = url;
      const auth = new URL(url);
      const redirect = new URL(auth.searchParams.get("redirect_uri")!);
      const state = auth.searchParams.get("state")!;
      await fetch(`${redirect.origin}${redirect.pathname}?code=oauth-code&state=${state}`);
    },
    fetchImpl: async (_input, init) => {
      const body = String(init?.body);
      assert.match(body, /grant_type=authorization_code/);
      assert.match(body, /code=oauth-code/);
      return new Response(JSON.stringify({ access_token: "short-lived", refresh_token: "long-lived", expires_in: 3600 }), { status: 200 });
    },
  });
  assert.equal(result.expiresIn, 3600);
  assert.equal(await store.load(), "long-lived");
  assert.equal(new URL(opened).searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.readonly");
});

test("refresh exchanges the stored refresh token without returning it in errors", async () => {
  const store = new MemoryStore();
  await store.save("refresh-secret");
  const token = await refreshGmailAccessToken({ clientId: "client-id", store, fetchImpl: async (_input, init) => {
    assert.match(String(init?.body), /refresh_token=refresh-secret/);
    return new Response(JSON.stringify({ access_token: "new-access", expires_in: 3599 }), { status: 200 });
  } });
  assert.deepEqual(token, { accessToken: "new-access", expiresIn: 3599 });
});

test("Gmail client refreshes automatically from OAuth credentials", async () => {
  const store = new MemoryStore();
  await store.save("refresh-secret");
  const result = await createAuthorizedGmailClient({ GMAIL_CLIENT_ID: "client-id" }, async (_input, init) => {
    assert.match(String(init?.body), /refresh_token=refresh-secret/);
    return new Response(JSON.stringify({ access_token: "fresh-access", expires_in: 3600 }), { status: 200 });
  }, store);
  assert.equal(result.credentials.source, "oauth-refresh");
  assert.ok(result.client);
});

test("PKCE verifier and challenge use URL-safe values", () => {
  const pair = createPkcePair();
  assert.match(pair.verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(pair.challenge, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(pair.verifier, pair.challenge);
});
