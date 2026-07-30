import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = new URL("..", import.meta.url);
const rootPath = fileURLToPath(root);
const expectedCommands = [
  "setup", "scrape", "rank", "apply", "interview", "outcome", "expand",
  "upskill", "gmail-sync", "html-report", "add-template",
  "add-portal", "reset",
];

const { stdout } = await exec("npm", ["pack", "--dry-run", "--json"], {
  cwd: rootPath,
  env: { ...process.env, npm_config_loglevel: "silent" },
});
const files = JSON.parse(stdout)[0].files.map(({ path }) => path);
const fileSet = new Set(files);

assert.ok(fileSet.has("package.json"));
assert.ok(fileSet.has("extensions/index.ts"));
assert.ok(fileSet.has("src/workspace.ts"));
assert.ok(expectedCommands.every((name) => fileSet.has(`prompts/${name}.md`)));
assert.deepEqual(
  files.filter((path) => path.startsWith("skills/") && path.endsWith("/SKILL.md")).sort(),
  [
    "skills/job-application-assistant/SKILL.md",
    "skills/job-scraper/SKILL.md",
    "skills/upskill/SKILL.md",
  ],
);
assert.equal(files.some((path) => path.includes(".pi-job-search")), false);
assert.equal(files.some((path) => path.startsWith("test/")), false);
assert.equal(files.some((path) => path.startsWith("specs/")), false);
assert.equal(files.some((path) => path.includes(".env")), false);

const manifest = JSON.parse(await readFile(join(rootPath, "package.json"), "utf8"));
assert.deepEqual(manifest.pi, {
  extensions: ["./extensions"],
  skills: ["./skills"],
  prompts: ["./prompts"],
});
console.log(`package verification passed (${files.length} files)`);
