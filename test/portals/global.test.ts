import assert from "node:assert/strict";
import test from "node:test";
import {
  createHimalayasAdapter,
  createPortalRegistry,
  createRemoteOkAdapter,
  createWeWorkRemotelyAdapter,
  parseHimalayasJson,
  parseRemoteOkJson,
  parseWeWorkRemotelyRss,
  type HttpClient,
} from "../../src/portals.js";

const himalayas = { jobs: [{ guid: "h-1", title: "Senior TypeScript Engineer", companyName: "Global Co", locationRestrictions: [{ alpha2: "US", name: "United States" }], timezoneRestrictions: ["UTC-5"], employmentType: "Full Time", minSalary: 120000, maxSalary: 160000, currency: "USD", description: "<p>Build APIs</p>", applicationLink: "https://himalayas.app/jobs/h-1", pubDate: "2026-07-30", categories: ["Engineering"] }] };
const wwr = `<rss><channel><item><guid>w-1</guid><title>Frontend Engineer</title><company>Remote Co</company><location>Anywhere</location><link>https://weworkremotely.com/remote-jobs/w-1</link><description><![CDATA[<p>Build interfaces</p>]]></description><pubDate>Wed, 30 Jul 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
const remoteOk = [{ legal: "link back" }, { id: "r-1", position: "Backend Engineer", company: "Remote Co", location: "Worldwide", tags: ["typescript", "backend"], description: "Build services", url: "https://remoteok.com/remote-jobs/r-1", apply_url: "https://remoteok.com/remote-jobs/r-1", salary_min: 100000, salary_max: 130000, date: "2026-07-30" }];

test("global source parsers preserve useful remote metadata", () => {
  assert.equal(parseHimalayasJson(himalayas)[0].countryRestrictions?.[0], "US");
  assert.equal(parseHimalayasJson(himalayas)[0].salary?.currency, "USD");
  assert.equal(parseWeWorkRemotelyRss(wwr)[0].company, "Remote Co");
  assert.deepEqual(parseRemoteOkJson(remoteOk)[0].tags, ["typescript", "backend"]);
});

test("Himalayas sends provider search filters", async () => {
  const http: HttpClient = async (url) => {
    assert.match(url, /q=typescript/);
    assert.match(url, /country=US/);
    assert.match(url, /seniority=Senior/);
    return { status: 200, headers: {}, body: JSON.stringify(himalayas) };
  };
  const result = await createHimalayasAdapter(http).search({ query: "typescript", country: "US", seniority: "Senior" });
  assert.equal(result.jobs.length, 1);
});

test("RSS and JSON sources filter locally", async () => {
  const http: HttpClient = async (url) => ({ status: 200, headers: {}, body: url.includes("weworkremotely") ? wwr : JSON.stringify(remoteOk) });
  assert.equal((await createWeWorkRemotelyAdapter(http).search({ query: "frontend" })).jobs.length, 1);
  assert.equal((await createRemoteOkAdapter(http).search({ query: "typescript" })).jobs.length, 1);
});

test("default registry is global-source only", () => {
  assert.deepEqual([...createPortalRegistry(async () => ({ status: 200, headers: {}, body: "" })).keys()], ["himalayas", "weworkremotely", "remoteok"]);
});
