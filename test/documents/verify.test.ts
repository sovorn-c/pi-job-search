import assert from "node:assert/strict";
import test from "node:test";
import { cleanupDocumentArtifacts, verifyDocument, type CommandRunner } from "../../src/documents.js";

const runner: CommandRunner = async (command) => {
  if (command === "pdfinfo") return { stdout: "Pages:           2\n", stderr: "" };
  if (command === "pdftotext") return { stdout: "Candidate Name\nTypeScript\nAcme\n", stderr: "" };
  throw new Error(`unexpected ${command}`);
};

test("document verification checks pages, extractable text, required text, and ATS keywords", async () => {
  const result = await verifyDocument({ pdfPath: "/tmp/cv.pdf", expectedPages: 2, requiredText: ["Candidate Name"], forbiddenText: ["TODO"], keywords: ["TypeScript", "Acme"] }, runner);
  assert.equal(result.passed, true);
  assert.deepEqual(result.missingKeywords, []);
});

test("document verification fails clearly on page and content gates", async () => {
  const bad: CommandRunner = async (command) => command === "pdfinfo" ? { stdout: "Pages: 3", stderr: "" } : { stdout: "Candidate", stderr: "" };
  const result = await verifyDocument({ pdfPath: "/tmp/cv.pdf", expectedPages: 2, requiredText: ["Missing"], forbiddenText: ["Candidate"], keywords: ["TypeScript"] }, bad);
  assert.equal(result.passed, false);
  assert.equal(result.pageCount, 3);
  assert.deepEqual(result.missingRequiredText, ["Missing"]);
  assert.deepEqual(result.forbiddenTextFound, ["Candidate"]);
  assert.deepEqual(result.missingKeywords, ["TypeScript"]);
});

test("cleanup only removes known generated build artifacts", async () => {
  const removed = await cleanupDocumentArtifacts("/tmp/app", ["cv.aux", "cv.log", "cv.pdf", "job-posting.md"]);
  assert.deepEqual(removed, ["cv.aux", "cv.log"]);
});
