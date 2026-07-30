import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { archiveSubmittedMaterials, applicationArchivePath } from "../../src/archive.js";

test("submitted materials are copied once with immutable hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-archive-"));
  const source = join(root, "source.pdf");
  try {
    await writeFile(source, "PDF CONTENT");
    const first = await archiveSubmittedMaterials(root, "acme_role", [source]);
    assert.equal(first.files.length, 1);
    const before = await readFile(first.files[0].archivePath, "utf8");
    const second = await archiveSubmittedMaterials(root, "acme_role", [source]);
    assert.equal(second.files[0].sha256, first.files[0].sha256);
    assert.equal(await readFile(first.files[0].archivePath, "utf8"), before);
    assert.equal(applicationArchivePath(root, "acme_role"), join(root, ".pi-job-search", "applications", "acme_role"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("archive keys cannot escape application state", async () => {
  await assert.rejects(() => archiveSubmittedMaterials("/tmp", "../escape", []), /invalid application key/);
});
