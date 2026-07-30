import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importPostings, type ImportFetcher } from "../src/import.js";

const posting = `<html><head><title>Engineer</title><script type="application/ld+json">{"@type":"JobPosting","title":"Senior Engineer","hiringOrganization":{"name":"Acme"},"jobLocation":{"address":{"addressLocality":"Remote"}},"datePosted":"2026-07-30","description":"Build reliable systems","employmentType":"FULL_TIME"}</script></head><body><main>Build reliable systems and APIs.</main></body></html>`;

test("imports pasted text and .txt/.md files", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-job-import-"));
  try {
    await writeFile(join(root, "job.md"), "# Product Engineer\n\nBuild useful products.");
    const result = await importPostings({ text: "# Backend Engineer\n\nBuild APIs.", files: [join(root, "job.md")] }, async () => { throw new Error("URL fetch should not run"); });
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].postingText, "# Backend Engineer\n\nBuild APIs.");
    assert.equal(result.items[1].job?.title, "Product Engineer");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("extracts structured URL postings and reports blocked partial results", async () => {
  let calls = 0;
  const fetcher: ImportFetcher = async (url) => {
    calls += 1;
    if (url.includes("blocked")) return { status: 403, headers: {}, body: "<title>Sign in</title><p>Verify you are human</p>" };
    return { status: 200, headers: {}, body: posting };
  };
  const result = await importPostings({ urls: ["https://example.com/jobs/1", "https://example.com/blocked"] }, fetcher);
  assert.equal(calls, 2);
  assert.equal(result.items[0].status, "complete");
  assert.equal(result.items[0].job?.company, "Acme");
  assert.equal(result.items[1].status, "partial");
  assert.match(result.items[1].error ?? "", /HTTP 403/);
  assert.equal(result.summary.failed, 0);
});

test("rejects unsafe URL schemes without fetching", async () => {
  const result = await importPostings({ urls: ["file:///etc/passwd"] });
  assert.equal(result.items[0].status, "failed");
  assert.match(result.items[0].error ?? "", /public HTTP/);
});
