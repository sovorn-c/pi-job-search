import assert from "node:assert/strict";
import test from "node:test";
import { renderDashboard, type ReportRow } from "../../src/report.js";

test("report escapes tracker values in cells, attributes, and SVG text", () => {
  const malicious: ReportRow = {
    applicationKey: "x", company: "<img src=x onerror=alert(1)>", role: "</td><script>alert(2)</script>",
    sector: "\"><svg onload=alert(3)>", channel: "online", status: "applied", notes: "& \" ' < >", source: "https://example.test/?q=\"&x=<script>", url: "",
  };
  const html = renderDashboard([malicious]);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;\/script&gt;/);
  assert.match(html, /&quot;&gt;&lt;svg onload=alert\(3\)&gt;/);
  assert.doesNotMatch(html, /<img src=x onerror=/i);
  assert.doesNotMatch(html, /<svg onload=/i);
  assert.doesNotMatch(html, /href="javascript:/i);
});
