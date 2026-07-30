import assert from "node:assert/strict";
import { createPortalRegistry } from "../src/portals.ts";
import { mergeSeenJobs, orchestrateScrape } from "../src/scrape.ts";

const http = async (url) => {
  if (url.includes("linkedin")) return { status: 200, headers: {}, body: '<a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/1"></a><h3 class="base-search-card__title">Engineer</h3><h4 class="base-search-card__subtitle">Acme</h4>' };
  return { status: 200, headers: {}, body: JSON.stringify({ jobs: [{ id: "1", title: "Engineer", company: "Acme", url: "https://freehire.example/1" }] }) };
};
const registry = createPortalRegistry(http);
const result = await orchestrateScrape([registry.get("linkedin"), registry.get("freehire")], { query: "engineer" }, { concurrency: 2 });
const merged = mergeSeenJobs(result.jobs, { seen: {}, applied: [] });
assert.equal(merged.newJobs.length, 1);
console.log("scrape verification passed");
