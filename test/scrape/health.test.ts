import assert from "node:assert/strict";
import test from "node:test";
import { assessPortalHealth, type PortalAdapter } from "../../src/scrape.js";

test("health classifies 429 as inconclusive and bounds probes", async () => {
  let calls = 0;
  const adapter: PortalAdapter = { name: "jobnet", async search() { calls += 1; throw Object.assign(new Error("rate"), { code: "rate_limit" }); }, async detail() { return null; } };
  const result = await assessPortalHealth(adapter, { query: "sentinel" }, { maxProbes: 1 });
  assert.equal(result.status, "inconclusive");
  assert.equal(calls, 1);
});

test("health reports healthy when a sentinel returns usable data", async () => {
  const adapter: PortalAdapter = { name: "freehire", async search() { return { jobs: [{ source: "freehire", id: "1", title: "Engineer", company: "Co", location: null, datePosted: null, url: "https://freehire.example/1", description: null, employmentType: null }], warnings: [] }; }, async detail() { return null; } };
  assert.equal((await assessPortalHealth(adapter, { query: "sentinel" })).status, "healthy");
});
