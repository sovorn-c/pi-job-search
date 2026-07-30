import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const prompts = [
  "setup",
  "scrape",
  "rank",
  "apply",
  "interview",
  "outcome",
  "expand",
  "upskill",
  "gmail-sync",
  "notion-sync",
  "html-report",
  "add-template",
  "add-portal",
  "reset",
];
const skills = ["job-application-assistant", "job-scraper", "upskill"];

test("package manifest declares the Pi resource surface", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

  assert.ok(manifest.keywords.includes("pi-package"));
  assert.deepEqual(manifest.pi, {
    extensions: ["./extensions"],
    skills: ["./skills"],
    prompts: ["./prompts"],
  });
});

test("package contains the exact commands and workflow skills", async () => {
  await Promise.all(
    prompts.map((name) => access(new URL(`prompts/${name}.md`, root))),
  );
  await Promise.all(
    skills.map(async (name) => {
      const content = await readFile(new URL(`skills/${name}/SKILL.md`, root), "utf8");
      assert.match(content, /^---\nname: [a-z0-9-]+\ndescription: .+\n---/);
    }),
  );
});

test("extension registers at least one deterministic tool", async () => {
  const { default: register } = await import("../../extensions/index.js");
  const tools: unknown[] = [];
  register({ registerTool: (tool: unknown) => tools.push(tool) });
  assert.ok(tools.length >= 16);
  assert.deepEqual(tools.map((tool) => (tool as { name: string }).name), [
    "job_search_capabilities",
    "job_search_initialize_workspace",
    "job_search_profile_consistency",
    "job_search_profile_reset",
    "job_search_scrape",
    "job_search_portal_health",
    "job_search_rank",
    "job_search_apply",
    "job_search_document_verify",
    "job_search_outcome",
    "job_search_followup",
    "job_search_interview",
    "job_search_expand",
    "job_search_upskill",
    "job_search_html_report",
    "job_search_gmail_sync",
  ]);
});
