import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { applyExpansion, proposeExpansion, type ExpansionSignal } from "../../src/expand.js";
import { initializeWorkspace } from "../../src/workspace.js";
import { updateProfileSection, readProfileSection } from "../../src/profile.js";

test("expansion deduplicates existing facts and keeps inferred signals pending", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-expand-"));
  try {
    await initializeWorkspace(root);
    await updateProfileSection(root, "candidate", { skills: ["TypeScript"] }, 0);
    const signals: ExpansionSignal[] = [
      { id: "python", section: "candidate", key: "python", value: "Python", source: "CV.pdf", evidence: "Built Python service", confidence: "high", status: "direct" },
      { id: "leadership", section: "behavioral", key: "leadership", value: "Leadership", source: "reference.txt", evidence: "Led delivery", confidence: "medium", status: "inferred" },
      { id: "typescript", section: "candidate", key: "skills", value: ["TypeScript"], source: "CV.pdf", evidence: "TypeScript", confidence: "high", status: "direct" },
    ];
    const proposals = await proposeExpansion(root, signals);
    assert.deepEqual(proposals.map((item) => item.id), ["python", "leadership"]);
    assert.equal(proposals[1].status, "inferred");
    const result = await applyExpansion(root, proposals, ["python"]);
    assert.deepEqual(result.approved, ["python"]);
    assert.equal((await readProfileSection(root, "candidate")).fields.python.value, "Python");
    assert.equal((await readProfileSection(root, "behavioral")).version, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("expansion preserves provenance and requires explicit approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-expand-approval-"));
  try {
    const signal: ExpansionSignal = { id: "go", section: "candidate", key: "go", value: "Go", source: "approved-url", evidence: "Go project", confidence: "high", status: "direct" };
    const proposals = await proposeExpansion(root, [signal]);
    const result = await applyExpansion(root, proposals, []);
    assert.deepEqual(result.approved, []);
    assert.equal((await readProfileSection(root, "candidate")).version, 0);
    const approved = await applyExpansion(root, proposals, ["go"]);
    assert.equal(approved.sections.candidate?.fields.go.provenance[0].source, "approved-url");
  } finally { await rm(root, { recursive: true, force: true }); }
});
