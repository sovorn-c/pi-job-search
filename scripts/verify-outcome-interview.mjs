import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveSubmittedMaterials } from "../src/archive.ts";
import { recordOutcome } from "../src/outcome.ts";
import { draftFollowup } from "../src/followup.ts";
import { buildInterviewPack, saveInterviewPack } from "../src/interview.ts";
import { writeTracker } from "../src/tracker.ts";

const root = await mkdtemp(join(tmpdir(), "pi-outcome-acceptance-"));
try {
  const source = join(root, "submitted-cv.pdf");
  await writeFile(source, "immutable submitted content");
  await writeTracker(root, [{ applicationKey: "acme_engineer", company: "Acme", role: "Engineer", url: "https://acme.example/job", status: "applied" }]);
  const archive = await archiveSubmittedMaterials(root, "acme_engineer", [source]);
  const before = createHash("sha256").update(await readFile(archive.files[0].archivePath)).digest("hex");
  for (const status of ["acknowledged", "interview", "offer"]) await recordOutcome(root, { applicationKey: "acme_engineer", date: "2026-07-30", stage: status, status, decision: "pending", evidence: "fixture", notes: status });
  const after = createHash("sha256").update(await readFile(archive.files[0].archivePath)).digest("hex");
  assert.equal(after, before);
  const followupInput = { cwd: root, applicationKey: "acme_engineer", company: "Acme", role: "Engineer", date: "2026-07-30", facts: ["TypeScript"], requestedClaims: ["TypeScript"] };
  await draftFollowup({ ...followupInput, kind: "thank-you", existingCount: 0 });
  await draftFollowup({ ...followupInput, kind: "follow-up", date: "2026-08-06", existingCount: 1 });
  await assert.rejects(() => draftFollowup({ ...followupInput, kind: "follow-up", date: "2026-08-13", existingCount: 2 }));
  const pack = buildInterviewPack({ applicationKey: "acme_engineer", company: "Acme", role: "Engineer", stage: "behavioral", postingText: "Required: TypeScript", submittedMaterials: ["submitted/submitted-cv.pdf"], approvedFacts: ["TypeScript"], feedback: [] });
  assert.equal(pack.starMappings[0].fact, "TypeScript");
  assert.match(await readFile(await saveInterviewPack(root, pack), "utf8"), /Interview preparation/);
  console.log("outcome-interview verification passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
