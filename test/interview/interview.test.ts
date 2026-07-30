import assert from "node:assert/strict";
import test from "node:test";
import { buildInterviewPack, answerMockQuestion, startMockInterview } from "../../src/interview.js";

test("stage-specific interview pack maps questions to approved evidence", () => {
  const pack = buildInterviewPack({
    applicationKey: "acme_engineer", company: "Acme", role: "Engineer", stage: "technical",
    postingText: "Required: TypeScript\nRequired: APIs", submittedMaterials: ["cv-draft.md", "cover-letter-draft.md"],
    approvedFacts: ["Built TypeScript services", "Led an API migration"], research: [], feedback: [],
  });
  assert.equal(pack.researchStatus, "unavailable");
  assert.ok(pack.questions.some((question) => /technical|design|code/i.test(question.text)));
  assert.deepEqual(pack.starMappings.map((mapping) => mapping.fact), ["Built TypeScript services", "Led an API migration"]);
  assert.ok(pack.sources.includes("cv-draft.md"));
});

test("mock protocol advances one question at a time and records feedback", () => {
  const pack = buildInterviewPack({ applicationKey: "a", company: "Co", role: "Role", stage: "behavioral", postingText: "", submittedMaterials: [], approvedFacts: ["Worked cross-functionally"], feedback: [] });
  const session = startMockInterview(pack);
  const next = answerMockQuestion(session, "I used STAR.", "Clear example");
  assert.equal(next.transcript.length, 1);
  assert.equal(next.currentQuestion, pack.questions[1]?.text ?? null);
});
