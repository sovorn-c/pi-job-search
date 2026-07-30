import assert from "node:assert/strict";
import test from "node:test";
import { applyReviewerEdits, runIsolatedReview, type ApprovedFact, type DraftClaim, type ReviewerReport } from "../../src/apply.js";

const facts: ApprovedFact[] = [{ id: "fact-1", key: "years", value: 8, source: "approved-profile", provenance: "profile/candidate.json" }];
const claims: DraftClaim[] = [{ id: "claim-1", key: "years", value: 8, text: "8 years of experience", factIds: ["fact-1"] }];

const report: ReviewerReport = {
  replacements: [{ claimId: "claim-1", text: "8 years building production systems", value: 8, factIds: ["fact-1"], rationale: "more targeted" }],
  companyClaims: [{ text: "Acme builds developer tools", sources: ["https://acme.example/about"] }],
  notes: ["Keep the quantified claim grounded."],
};

test("reviewer receives an isolated immutable snapshot and accepted edits are audited", async () => {
  let received: unknown;
  const reviewed = await runIsolatedReview({ postingText: "Required: TypeScript", company: "Acme", claims, evaluation: { eligible: true, blocking: [], requirements: [], gaps: [], postingText: "" } }, async (snapshot) => {
    received = snapshot;
    return report;
  });
  assert.equal((received as { tools?: unknown }).tools, undefined);
  const result = applyReviewerEdits(claims, reviewed, facts, "https://example.com/job");
  assert.equal(result.blocked, false);
  assert.equal(result.claims[0].text, "8 years building production systems");
  assert.equal(result.audit[0].replacement, "8 years building production systems");
});

test("company claims require a source independent from the posting URL", () => {
  const blocked = applyReviewerEdits(claims, { ...report, companyClaims: [{ text: "Acme claim", sources: ["https://example.com/job"] }] }, facts, "https://example.com/job");
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.blocking[0], "company-claim-unverified");
});
