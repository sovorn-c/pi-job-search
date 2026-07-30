import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { executeReset, extractDocument, resolveStatePath } from "../../src/profile.js";

test("state paths cannot escape the workspace root", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  assert.throws(() => resolveStatePath(cwd, "../outside"), /outside workspace/);
  assert.throws(() => resolveStatePath(cwd, "/tmp/outside"), /outside workspace/);
  assert.match(resolveStatePath(cwd, "profile/candidate.json"), /\.pi-job-search[\\/]profile/);
});

test("document extraction rejects symlinks that resolve outside local state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const root = join(cwd, ".pi-job-search", "documents");
  const outside = join(cwd, "private.txt");
  await mkdir(root, { recursive: true });
  await writeFile(outside, "private", "utf8");
  const link = join(root, "linked.txt");
  await symlink(outside, link);
  await assert.rejects(() => extractDocument(cwd, link), /outside workspace/);
});

test("reset rejects a symlinked state root", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const outside = await mkdtemp(join(tmpdir(), "pi-job-search-outside-"));
  await symlink(outside, join(cwd, ".pi-job-search"));
  await assert.rejects(() => executeReset(cwd, "all", "RESET"), /must not be a symlink/);
});
