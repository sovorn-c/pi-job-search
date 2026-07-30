import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inventoryDocuments, extractDocument } from "../../src/profile.js";

test("inventory and text extraction stay local to the document root", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const root = join(cwd, ".pi-job-search", "documents");
  await mkdir(join(root, "cv"), { recursive: true });
  const path = join(root, "cv", "resume.md");
  await writeFile(path, "# Ada Lovelace\nPython", "utf8");

  const entries = await inventoryDocuments(cwd);
  assert.deepEqual(entries.map((entry) => entry.relativePath), ["cv/resume.md"]);
  const extracted = await extractDocument(cwd, path);
  assert.equal(extracted.status, "extracted");
  assert.match(extracted.text ?? "", /Ada Lovelace/);
});

test("unsupported document formats are reported rather than guessed", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-job-search-"));
  const root = join(cwd, ".pi-job-search", "documents");
  await mkdir(root, { recursive: true });
  const path = join(root, "document.bin");
  await writeFile(path, Buffer.from([0, 1, 2]));
  const result = await extractDocument(cwd, path);
  assert.equal(result.status, "unsupported");
  assert.equal(result.text, undefined);
});
