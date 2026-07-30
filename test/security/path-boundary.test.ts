import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveStatePath } from "../../src/profile.js";

test("state paths cannot escape the workspace root", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  assert.throws(() => resolveStatePath(cwd, "../outside"), /outside workspace/);
  assert.throws(() => resolveStatePath(cwd, "/tmp/outside"), /outside workspace/);
  assert.match(resolveStatePath(cwd, "profile/candidate.json"), /\.pi-job-search[\\/]profile/);
});
