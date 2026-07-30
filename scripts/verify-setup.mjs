import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySetupPlan, executeReset, setupFromInterview, readProfileSection } from "../src/profile.ts";

const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-setup-"));
const plan = await setupFromInterview(cwd, { name: "Ada Lovelace", titles: ["Engineer"] });
assert.equal((await applySetupPlan(cwd, plan, { approve: ["name", "titles"] })).written, true);
assert.equal((await readProfileSection(cwd, "candidate")).fields.name.value, "Ada Lovelace");
await writeFile(join(cwd, ".pi-job-search", "documents.txt"), "fixture", "utf8");
assert.equal((await executeReset(cwd, "profile", "RESET")).executed, true);
assert.equal((await executeReset(cwd, "all", "RESET")).executed, true);
console.log("setup verification passed");
