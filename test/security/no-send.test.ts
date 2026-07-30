import assert from "node:assert/strict";
import test from "node:test";
import * as followup from "../../src/followup.js";

test("follow-up module exposes draft operations only", () => {
  assert.equal("sendFollowup" in followup, false);
  assert.equal("sendEmail" in followup, false);
});
