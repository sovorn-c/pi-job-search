import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = new URL("../..", import.meta.url);
const rootPath = fileURLToPath(root);

test("headless CLI resolves package resources independently of cwd", async () => {
  const { stdout } = await exec("npm", ["run", "cli", "--", "capabilities"], {
    cwd: rootPath,
    env: { ...process.env, npm_config_loglevel: "silent" },
  });
  const result = JSON.parse(stdout);

  assert.equal(result.package, "pi-job-search");
  assert.equal(result.commands.length, 15);
  assert.deepEqual(result.skills, [
    "job-application-assistant",
    "job-scraper",
    "upskill",
  ]);
});
