import assert from "node:assert/strict";
import test from "node:test";
import { computeReportStats, renderDashboard, type ReportRow } from "../../src/report.js";

const rows: ReportRow[] = [
  { applicationKey: "a", company: "Acme", role: "Engineer", sector: "Tech", channel: "online", status: "applied", url: "https://jobs.example/a" },
  { applicationKey: "b", company: "Beta", role: "Developer", sector: "Tech", channel: "referral", status: "interview", url: "" },
  { applicationKey: "c", company: "Gamma", role: "Analyst", sector: "Finance", channel: "other", status: "rejected", url: "" },
];

test("report stats normalize funnel and status buckets", () => {
  const stats = computeReportStats(rows);
  assert.equal(stats.total, 3);
  assert.equal(stats.status.Interview, 1);
  assert.equal(stats.status["Rejected/Closed"], 1);
  assert.equal(stats.funnel.progressed, 1);
  assert.equal(stats.rejectionRate, 50);
  assert.equal(stats.sectors.Tech, 2);
});

test("dashboard is self-contained and includes combined filters", () => {
  const html = renderDashboard(rows, "2026-07-30T00:00:00.000Z");
  assert.match(html, /<svg[^>]+role="img"/);
  assert.match(html, /id="search"/);
  assert.match(html, /id="status-filter"/);
  assert.match(html, /id="sector-filter"/);
  assert.doesNotMatch(html, /https:\/\/cdn\.|<link[^>]+href=/i);
  assert.match(html, /window\.addEventListener\("DOMContentLoaded"/);
});
