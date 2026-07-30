import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSingleRole, normalizeSkill, type VerifiedResource } from "../../src/upskill.js";

test("single-role analysis separates hard required gaps from preferred signals", () => {
  const report = analyzeSingleRole({
    source: "https://jobs.example/acme", postingText: "Required: TypeScript\nRequired: PostgreSQL\nPreferred: Kubernetes",
    approvedSkills: ["TypeScript"],
  });
  assert.equal(normalizeSkill("Node.js"), "node js");
  assert.deepEqual(report.hardGaps.map((gap) => gap.text), ["PostgreSQL"]);
  assert.deepEqual(report.preferredGaps.map((gap) => gap.text), ["Kubernetes"]);
  assert.equal(report.gaps[0].priority, 3);
  assert.equal(report.gaps[0].source, "https://jobs.example/acme");
});

test("resource lookup validates independently retrieved URLs and degrades when unavailable", async () => {
  const report = analyzeSingleRole({ postingText: "Required: Rust", approvedSkills: [] });
  const resource: VerifiedResource = { title: "Rust Book", url: "https://doc.rust-lang.org/book/", source: "Rust Foundation", verified: true };
  const available = await report.withResources(async () => [resource]);
  assert.equal(available.resourceStatus, "available");
  assert.deepEqual(available.resources, [resource]);
  const unavailable = await report.withResources(async () => { throw new Error("offline"); });
  assert.equal(unavailable.resourceStatus, "unavailable");
  assert.deepEqual(unavailable.resources, []);
});
