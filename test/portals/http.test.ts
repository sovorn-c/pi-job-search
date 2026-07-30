import assert from "node:assert/strict";
import test from "node:test";
import { requestWithRetry, PortalError } from "../../src/portals.js";

test("HTTP retries 429 and 5xx within bounded policy", async () => {
  let calls = 0;
  const result = await requestWithRetry("https://example.com/jobs", async () => {
    calls += 1;
    return calls === 1
      ? { status: 429, headers: { "retry-after": "0" }, body: "busy" }
      : { status: 200, headers: {}, body: "ok" };
  }, { maxRetries: 2, timeoutMs: 100, sleep: async () => {} });
  assert.equal(result.body, "ok");
  assert.equal(calls, 2);
});

test("HTTP errors are typed and do not retry 404", async () => {
  let calls = 0;
  await assert.rejects(
    () => requestWithRetry("https://example.com/missing", async () => {
      calls += 1;
      return { status: 404, headers: {}, body: "missing" };
    }, { maxRetries: 3, timeoutMs: 100, sleep: async () => {} }),
    (error: unknown) => error instanceof PortalError && error.code === "http" && error.status === 404,
  );
  assert.equal(calls, 1);
});

test("HTTP timeout is reported as a typed failure", async () => {
  await assert.rejects(
    () => requestWithRetry("https://example.com/slow", async (_url, _init, signal) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (signal?.aborted) throw new Error("aborted");
      return { status: 200, headers: {}, body: "late" };
    }, { maxRetries: 0, timeoutMs: 1, sleep: async () => {} }),
    (error: unknown) => error instanceof PortalError && error.code === "timeout",
  );
});
