import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readProfileSection,
  updateProfileSection,
  writeProfileSection,
} from "../../src/profile.js";

test("section updates preserve unrelated section data and use expected versions", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  await writeProfileSection(cwd, "candidate", { name: "Ada" }, { source: "cv", kind: "cv" }, 0);
  await writeProfileSection(cwd, "search", { titles: ["Engineer"] }, { source: "interview", kind: "interview" }, 0);
  const before = await readProfileSection(cwd, "candidate");
  await updateProfileSection(cwd, "search", { locations: ["London"] }, 1);
  assert.deepEqual((await readProfileSection(cwd, "candidate")).fields, before.fields);
  assert.deepEqual((await readProfileSection(cwd, "search")).fields.titles.value, ["Engineer"]);
  assert.deepEqual((await readProfileSection(cwd, "search")).fields.locations.value, ["London"]);
  await assert.rejects(() => updateProfileSection(cwd, "search", { titles: ["Paris"] }, 1), /version conflict/);
});
