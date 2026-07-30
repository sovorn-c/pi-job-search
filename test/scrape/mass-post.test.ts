import assert from "node:assert/strict";
import test from "node:test";
import { consolidateMassPosts, type NormalizedJob } from "../../src/scrape.js";

const make = (location: string): NormalizedJob => ({ source: "jobbank", id: location, title: "Nurse", company: "Health Co", location, datePosted: null, url: `https://jobbank.example/${location}`, description: null, employmentType: null });

test("near-identical city postings consolidate without losing locations", () => {
  const result = consolidateMassPosts([make("Copenhagen"), make("Aarhus"), make("Odense")]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].locations.sort(), ["Aarhus", "Copenhagen", "Odense"]);
});
