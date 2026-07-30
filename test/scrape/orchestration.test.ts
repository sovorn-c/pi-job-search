import assert from "node:assert/strict";
import test from "node:test";
import { orchestrateScrape, type PortalAdapter } from "../../src/scrape.js";

test("scrape continues after isolated adapter failure with bounded concurrency", async () => {
  let active = 0;
  let peak = 0;
  const good = (name: string): PortalAdapter => ({
    name,
    async search() {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { jobs: [{ source: name, id: name, title: "Engineer", company: name, location: null, datePosted: null, url: `https://${name}.example/job` , description: null, employmentType: null }], warnings: [] };
    },
    async detail() { return null; },
  });
  const bad: PortalAdapter = { name: "broken", async search() { throw new Error("offline"); }, async detail() { return null; } };
  const result = await orchestrateScrape([good("one"), good("two"), bad], { query: "engineer" }, { concurrency: 2 });
  assert.equal(result.jobs.length, 2);
  assert.ok(peak <= 2);
  assert.equal(result.failures.length, 1);
});
