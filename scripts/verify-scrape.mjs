import assert from "node:assert/strict";
import { createPortalRegistry } from "../src/portals.ts";
import { mergeSeenJobs, orchestrateScrape } from "../src/scrape.ts";

const http = async (url) => {
  if (url.includes("weworkremotely")) return { status: 200, headers: {}, body: '<rss><channel><item><guid>w-1</guid><title>Engineer</title><company>Acme</company><link>https://weworkremotely.com/remote-jobs/w-1</link></item></channel></rss>' };
  if (url.includes("remoteok")) return { status: 200, headers: {}, body: JSON.stringify([{ id: "r-1", position: "Engineer", company: "Acme", url: "https://remoteok.com/remote-jobs/r-1", tags: ["engineering"] }]) };
  return { status: 200, headers: {}, body: JSON.stringify({ jobs: [{ guid: "h-1", title: "Engineer", companyName: "Acme", applicationLink: "https://himalayas.app/jobs/h-1" }] }) };
};
const registry = createPortalRegistry(http);
const result = await orchestrateScrape([...registry.values()], { query: "engineer" }, { concurrency: 3 });
const merged = mergeSeenJobs(result.jobs, { seen: {}, applied: [] });
assert.equal(merged.newJobs.length, 1);
console.log("scrape verification passed");
