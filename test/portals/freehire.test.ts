import assert from "node:assert/strict";
import test from "node:test";
import { createFreehireAdapter, parseFreehireJson, type HttpClient } from "../../src/portals.js";

const fixture = { jobs: [{ id: "f-1", title: "ML Engineer", company: { name: "Freehire Co" }, location: "Remote", url: "https://freehire.example/jobs/f-1", posted_at: "2026-07-30" }] };

test("Freehire API fixture parser handles nested company names", () => {
  assert.equal(parseFreehireJson(fixture)[0].company, "Freehire Co");
  assert.equal(parseFreehireJson(fixture)[0].datePosted, "2026-07-30");
});

test("Freehire adapter uses the public search endpoint", async () => {
  const http: HttpClient = async (url) => {
    assert.match(url, /api\/v1\/agent\/jobs\/search/);
    return { status: 200, headers: {}, body: JSON.stringify(fixture) };
  };
  const result = await createFreehireAdapter(http).search({ query: "ml", limit: 10 });
  assert.equal(result.jobs[0].id, "f-1");
});
