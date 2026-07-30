import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeJsonAtomic } from "../../src/workspace.js";

test("atomic JSON writes leave the final file valid", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const target = join(directory, "state.json");

  await writeJsonAtomic(target, { ready: true, values: [1, 2, 3] });

  assert.deepEqual(JSON.parse(await readFile(target, "utf8")), {
    ready: true,
    values: [1, 2, 3],
  });
});
