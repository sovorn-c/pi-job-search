import assert from "node:assert/strict";
import test from "node:test";
import { createJobnetAdapter, parseJobnetJson, type HttpClient } from "../../src/portals.js";

const fixture = { jobs: [{ id: "n-1", title: "Data Analyst", companyName: "Jobnet Co", location: "Odense", url: "https://jobnet.dk/job/1", published: "2026-07-28" }] };

test("Jobnet BFF fixture parser handles nullable fields", () => {
  const job = parseJobnetJson(fixture)[0];
  assert.equal(job.title, "Data Analyst");
  assert.equal(job.description, null);
});

test("Jobnet adapter sends the CSRF header", async () => {
  const http: HttpClient = async (_url, init) => {
    assert.equal(init?.headers?.["x-csrf"], "1");
    return { status: 200, headers: {}, body: JSON.stringify(fixture) };
  };
  const result = await createJobnetAdapter(http).search({ query: "data" });
  assert.equal(result.jobs[0].source, "jobnet");
});
