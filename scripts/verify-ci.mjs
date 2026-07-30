import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const exec = promisify(execFile);
const workflow = join(root, ".github/workflows/ci.yml");
await access(workflow);
const content = await readFile(workflow, "utf8");
for (const command of ["npm ci --ignore-scripts", "npm run typecheck", "npm test", "npm run verify:package", "npm run verify:security"]) assert.match(content, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(content, /npm publish|JOB_SEARCH_LIVE_SMOKE\s*=\s*1/);
for (const script of ["typecheck", "test", "verify:package", "verify:security"]) await exec("npm", ["run", script], { cwd: root, env: { ...process.env, JOB_SEARCH_LIVE_SMOKE: "0" }, maxBuffer: 8_000_000 });
console.log("CI workflow verification passed");
