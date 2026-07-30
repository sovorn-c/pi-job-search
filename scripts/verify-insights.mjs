import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyExpansion, proposeExpansion } from "../src/expand.ts";
import { initializeWorkspace, writeJsonAtomic } from "../src/workspace.ts";
import { aggregateUpskill, analyzeSingleRole, diffReports, writeUpskillReport } from "../src/upskill.ts";
import { generateHtmlReport } from "../src/report.ts";
import { stableApplicationKey, writeTracker } from "../src/tracker.ts";

const root = await mkdtemp(join(tmpdir(), "pi-insights-"));
try {
  await initializeWorkspace(root);
  const proposals = await proposeExpansion(root, [
    { id: "python", section: "candidate", key: "python", value: "Python", source: "cv.txt", evidence: "Python service", confidence: "high", status: "direct" },
    { id: "inferred", section: "behavioral", key: "leadership", value: "Leadership", source: "reference.txt", evidence: "Led delivery", confidence: "medium", status: "inferred" },
  ]);
  assert.equal(proposals.length, 2);
  assert.equal((await applyExpansion(root, proposals, ["python"])).approved[0], "python");
  assert.equal((await analyzeSingleRole({ postingText: "Required: PostgreSQL", approvedSkills: [] })).hardGaps.length, 1);
  const first = aggregateUpskill([{ applicationKey: "a", role: "Senior", importance: 2, gaps: [{ text: "PostgreSQL", priority: 3 }] }], undefined, "2026-07-30");
  const second = aggregateUpskill([{ applicationKey: "a", role: "Senior", importance: 2, gaps: [{ text: "Rust", priority: 3 }] }], first, "2026-07-31");
  assert.deepEqual(diffReports(first, second).added, ["rust"]);
  await writeUpskillReport(root, first, "2026-07-30");
  await writeUpskillReport(root, second, "2026-07-31");
  await writeTracker(root, [{ applicationKey: stableApplicationKey("<img src=x onerror=alert(1)>", "Engineer"), company: "<img src=x onerror=alert(1)>", role: "Engineer", url: "", status: "applied", date: "2026-07-30", sector: "Tech", channel: "online", notes: "</td><script>alert(2)</script>" }]);
  const report = await generateHtmlReport(root);
  const html = await readFile(report.path, "utf8");
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x onerror=/i);
  assert.doesNotMatch(html, /<link[^>]+href=/i);
  console.log("insights verification passed");
} finally { await rm(root, { recursive: true, force: true }); }
