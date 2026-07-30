import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { investigatePortal } from "../../src/portal-generator.js";
import { scaffoldPortalAdapter, verifyPortalFixture } from "../../src/portal-scaffold.js";

test("scaffolds a fixture-backed adapter and enables only after explicit smoke verification", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-portal-scaffold-"));
  try {
    await investigatePortal(root, { name: "market", url: "https://market.example/jobs", authRequired: false, robots: "allowed", terms: "allowed" });
    const fixture = { search: [{ id: "1", title: "Engineer", company: "Acme", url: "https://market.example/jobs/1" }], detail: { id: "1", title: "Engineer", company: "Acme", url: "https://market.example/jobs/1" } };
    assert.deepEqual(verifyPortalFixture(fixture), { passed: true, errors: [] });
    const result = await scaffoldPortalAdapter(root, { name: "market", fixture, fixtureVerified: true, manualSmokeVerified: true, manualEvidence: { source: "https://market.example/jobs", result: "pass" } });
    assert.equal(result.enabled, true);
    await access(join(root, ".pi-job-search/portals/market/adapter.ts"));
    assert.match(await readFile(join(root, ".pi-job-search/portals/market/adapter.ts"), "utf8"), /PortalAdapter/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("does not enable a scaffold without fixture and live smoke evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-portal-scaffold-"));
  try {
    await investigatePortal(root, { name: "market", url: "https://market.example/jobs", authRequired: false, robots: "allowed", terms: "allowed" });
    const fixture = { search: [{ title: "Engineer", company: "Acme", url: "https://market.example/jobs/1" }], detail: { title: "Engineer", company: "Acme", url: "https://market.example/jobs/1" } };
    const result = await scaffoldPortalAdapter(root, { name: "market", fixture });
    assert.equal(result.enabled, false);
    assert.deepEqual(verifyPortalFixture({ search: "bad", detail: {} }), { passed: false, errors: ["fixture.search must be an array", "fixture.detail must be a normalized job"] });
  } finally { await rm(root, { recursive: true, force: true }); }
});
