import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = new URL("../..", import.meta.url);
const rootPath = fileURLToPath(root);

test("package verification proves a clean resource inventory", async () => {
  const { stdout } = await exec("npm", ["run", "verify:package"], {
    cwd: rootPath,
    env: { ...process.env, npm_config_loglevel: "silent" },
  });

  assert.match(stdout, /package verification passed/);
});
