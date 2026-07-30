import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initializeWorkspace } from "../../src/workspace.js";

test("workspace initialization is safe and idempotent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const first = await initializeWorkspace(cwd);
  const configPath = join(first.root, "config.json");
  const firstConfig = await readFile(configPath, "utf8");
  const firstMtime = (await stat(configPath)).mtimeMs;
  const firstIgnore = await readFile(join(cwd, ".gitignore"), "utf8");

  const second = await initializeWorkspace(cwd);

  assert.equal(second.root, first.root);
  assert.equal(await readFile(configPath, "utf8"), firstConfig);
  assert.equal((await stat(configPath)).mtimeMs, firstMtime);
  assert.equal(await readFile(join(cwd, ".gitignore"), "utf8"), firstIgnore);
  assert.deepEqual(JSON.parse(firstConfig), { schemaVersion: 1 });
});
