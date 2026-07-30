import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { executeReset, previewReset } from "../../src/profile.js";

test("reset previews impact and requires literal RESET", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const profile = join(cwd, ".pi-job-search", "profile");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(profile, { recursive: true }));
  await writeFile(join(profile, "candidate.json"), "{}", "utf8");
  const preview = await previewReset(cwd, "profile");
  assert.ok(preview.paths.some((path) => path.endsWith("candidate.json")));
  assert.equal((await executeReset(cwd, "profile", "reset")).executed, false);
  await access(join(profile, "candidate.json"));
  assert.equal((await executeReset(cwd, "profile", "RESET")).executed, true);
  await assert.rejects(() => access(join(profile, "candidate.json")));
});
