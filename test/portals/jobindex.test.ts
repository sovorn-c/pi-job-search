import assert from "node:assert/strict";
import test from "node:test";
import { createJobindexAdapter, parseJobindexHtml, type HttpClient } from "../../src/portals.js";

const fixture = `<script>var Stash = {"jobs":[{"id":"j-1","title":"Software Engineer","company":"Nordic Co","location":"Aarhus","url":"/job/1","date":"2026-07-29"}]};</script>`;

test("Jobindex parses embedded Stash search JSON", () => {
  const jobs = parseJobindexHtml(fixture);
  assert.equal(jobs[0].id, "j-1");
  assert.equal(jobs[0].url, "https://www.jobindex.dk/job/1");
});

test("Jobindex adapter returns fixture jobs", async () => {
  const http: HttpClient = async () => ({ status: 200, headers: {}, body: fixture });
  const result = await createJobindexAdapter(http).search({ query: "software" });
  assert.equal(result.jobs[0].company, "Nordic Co");
});
