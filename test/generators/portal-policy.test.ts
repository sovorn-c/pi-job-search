import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { investigatePortal, listPortalInvestigations, portalAccessDecision } from "../../src/portal-generator.js";

test("refuses auth-walled portals and records an official API recommendation", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-portal-policy-"));
  try {
    const result = await investigatePortal(root, { name: "private", url: "https://private.example/jobs", authRequired: true, robots: "allowed", terms: "allowed" });
    assert.equal(result.decision, "refuse");
    assert.match(result.reason, /official API|authentication/i);
    assert.equal((await listPortalInvestigations(root))[0].decision, "refuse");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("surfaces warnings for restricted public portals without silently enabling them", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-portal-policy-"));
  try {
    assert.equal(portalAccessDecision({ authRequired: false, robots: "restricted", terms: "unknown" }).decision, "warn");
    const result = await investigatePortal(root, { name: "public", url: "https://public.example/jobs", authRequired: false, robots: "restricted", terms: "unknown" });
    assert.equal(result.decision, "warn");
    assert.equal(result.enabled, false);
    assert.match(result.warning, /personal use|restriction/i);
    await assert.rejects(() => investigatePortal(root, { name: "bad", url: "file:///etc/passwd", authRequired: false, robots: "allowed", terms: "allowed" }), /https|source URL/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
