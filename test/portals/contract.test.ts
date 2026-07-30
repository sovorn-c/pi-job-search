import assert from "node:assert/strict";
import test from "node:test";
import { createPortalRegistry, normalizeJob, type HttpClient } from "../../src/portals.js";

test("normalized jobs keep explicit nulls and source attribution", () => {
  assert.deepEqual(normalizeJob({ source: "freehire", id: "42", title: "Engineer", company: "Acme", url: "https://freehire.example/jobs/42" }), {
    source: "freehire",
    id: "42",
    title: "Engineer",
    company: "Acme",
    location: null,
    datePosted: null,
    url: "https://freehire.example/jobs/42",
    description: null,
    employmentType: null,
  });
});

test("registry exposes all six public adapters behind one contract", () => {
  const http: HttpClient = async () => ({ status: 200, headers: {}, body: "" });
  const registry = createPortalRegistry(http);
  assert.deepEqual([...registry.keys()], ["linkedin", "freehire", "jobindex", "jobnet", "jobbank", "jobdanmark"]);
  for (const adapter of registry.values()) {
    assert.equal(typeof adapter.search, "function");
    assert.equal(typeof adapter.detail, "function");
  }
});

test("source allowlists reject posting-body URLs", () => {
  const http: HttpClient = async () => ({ status: 200, headers: {}, body: "" });
  const adapter = createPortalRegistry(http).get("linkedin")!;
  assert.rejects(() => adapter.detail("https://evil.example/job/1"), /source allowlist/);
});
