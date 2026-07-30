import assert from "node:assert/strict";
import test from "node:test";
import { mergeSeenJobs, stableJobId, type NormalizedJob } from "../../src/scrape.js";

const job = (source: string, url: string, company = "Acme"): NormalizedJob => ({ source, id: `${source}-1`, title: "Engineer", company, location: "Copenhagen", datePosted: null, url, description: null, employmentType: null });

test("dedup keeps one new canonical job and all source evidence", () => {
  const merged = mergeSeenJobs([job("one", "https://one.example/a"), job("two", "https://two.example/a")], { seen: {}, applied: [] });
  assert.equal(merged.newJobs.length, 1);
  assert.equal(merged.newJobs[0].sources.length, 2);
  assert.equal(stableJobId(job("one", "https://one.example/a")), stableJobId(job("two", "https://two.example/a")));
});

test("seen and applied identities are excluded", () => {
  const first = job("one", "https://one.example/a");
  const merged = mergeSeenJobs([first], { seen: { [stableJobId(first)]: first }, applied: [stableJobId(first)] });
  assert.equal(merged.newJobs.length, 0);
});
