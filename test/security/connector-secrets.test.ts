import assert from "node:assert/strict";
import test from "node:test";
import { getGmailCredentialStatus, redactSecrets } from "../../src/gmail.js";

test("missing Gmail authorization is an explainable no-op and never reveals token values", () => {
  const result = getGmailCredentialStatus({});
  assert.deepEqual(result, { configured: false, source: null });
  const token = "refresh-secret-123";
  assert.equal(redactSecrets(`Authorization: Bearer ${token}`, [token]), "Authorization: Bearer [redacted]");
});
