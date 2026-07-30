import assert from "node:assert/strict";
import test from "node:test";
import { createJobbankAdapter, parseJobbankRss, parseJobPostingJsonLd, type HttpClient } from "../../src/portals.js";

const rss = `<rss><channel><item><guid>b-1</guid><title>Research Engineer</title><link>https://jobbank.dk/job/1</link><description>Lab Co</description><pubDate>Wed, 30 Jul 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
const detail = `<script type="application/ld+json">{"@type":"JobPosting","title":"Research Engineer","hiringOrganization":{"name":"Lab Co"},"jobLocation":{"address":{"addressLocality":"Roskilde"}},"description":"Build things"}</script>`;

test("Jobbank RSS and JSON-LD parsers retain attribution", () => {
  assert.equal(parseJobbankRss(rss)[0].id, "b-1");
  assert.equal(parseJobPostingJsonLd(detail, "https://jobbank.dk/job/1").location, "Roskilde");
});

test("Jobbank adapter searches RSS", async () => {
  const http: HttpClient = async () => ({ status: 200, headers: {}, body: rss });
  const result = await createJobbankAdapter(http).search({ query: "research" });
  assert.equal(result.jobs[0].company, "Lab Co");
});
