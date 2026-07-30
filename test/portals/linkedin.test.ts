import assert from "node:assert/strict";
import test from "node:test";
import { createLinkedInAdapter, parseLinkedInHtml, type HttpClient } from "../../src/portals.js";

const fixture = `<ul><li class="base-card"><h3 class="base-search-card__title">Data Engineer</h3><h4 class="base-search-card__subtitle">Acme</h4><span class="job-search-card__location">Copenhagen</span><time datetime="2026-07-30">Today</time><a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/123">View</a></li></ul>`;

test("LinkedIn guest fixture parser normalizes a job", () => {
  assert.equal(parseLinkedInHtml(fixture)[0].id, "123");
  assert.equal(parseLinkedInHtml(fixture)[0].company, "Acme");
});

test("LinkedIn adapter searches without authentication", async () => {
  const http: HttpClient = async () => ({ status: 200, headers: {}, body: fixture });
  const result = await createLinkedInAdapter(http).search({ query: "data", limit: 5 });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].source, "linkedin");
});
