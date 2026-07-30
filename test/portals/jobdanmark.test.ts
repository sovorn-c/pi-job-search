import assert from "node:assert/strict";
import test from "node:test";
import { createJobdanmarkAdapter, parseJobdanmarkJson, parseJobPostingJsonLd, type HttpClient } from "../../src/portals.js";

const fixture = { jobs: [{ id: "d-1", slug: "platform-engineer", title: "Platform Engineer", company: "DK Co", city: "Aalborg", url: "https://jobdanmark.dk/job/platform-engineer" }] };

test("Jobdanmark parser reads the paginated search response", () => {
  assert.equal(parseJobdanmarkJson(fixture)[0].location, "Aalborg");
});

test("Jobdanmark adapter includes required displayText filter values", async () => {
  const http: HttpClient = async (_url, init) => {
    assert.match(String(init?.body), /displayText/);
    return { status: 200, headers: {}, body: JSON.stringify(fixture) };
  };
  const result = await createJobdanmarkAdapter(http).search({ query: "platform" });
  assert.equal(result.jobs[0].id, "d-1");
});
