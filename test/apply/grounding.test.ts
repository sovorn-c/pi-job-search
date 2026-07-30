import assert from "node:assert/strict";
import test from "node:test";
import { groundClaims, type ApprovedFact, type DraftClaim } from "../../src/apply.js";

test("grounding accepts claims supported by approved profile facts", () => {
  const facts: ApprovedFact[] = [{ id: "fact-1", key: "years", value: 8, source: "approved-profile", provenance: "profile/candidate.json" }];
  const claims: DraftClaim[] = [{ id: "claim-1", key: "years", value: 8, text: "8 years of experience", factIds: ["fact-1"] }];
  const result = groundClaims(claims, facts);
  assert.equal(result.blocked, false);
  assert.equal(result.claims[0].status, "grounded");
});

test("unsupported and contradictory claims block finalization", () => {
  const facts: ApprovedFact[] = [{ id: "fact-1", key: "years", value: 8, source: "base-cv", provenance: "cv.pdf" }];
  const result = groundClaims([
    { id: "claim-1", key: "years", value: 10, text: "10 years of experience", factIds: ["fact-1"] },
    { id: "claim-2", key: "securityClearance", value: "Top Secret", text: "Top Secret clearance", factIds: [] },
  ], facts);
  assert.equal(result.blocked, true);
  assert.deepEqual(result.blocking.map((item) => item.reason), ["contradiction", "unsupported"]);
});
