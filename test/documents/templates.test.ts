import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { registerTemplate, resolveTemplate } from "../../src/templates.js";

test("stock CV, cover-letter, and form templates resolve from the package", async () => {
  for (const name of ["cv", "cover-letter", "form-answers"] as const) {
    const template = await resolveTemplate(name);
    assert.equal(template.name, name);
    assert.ok(template.content.length > 10);
  }
});

test("registered templates stay inside workspace and resolve by name", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-template-"));
  try {
    await registerTemplate(root, "custom", "CUSTOM TEMPLATE");
    assert.equal((await resolveTemplate("custom", root)).content, "CUSTOM TEMPLATE");
    await assert.rejects(() => registerTemplate(root, "../escape", "bad"), /invalid template name/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
