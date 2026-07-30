import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { addTemplate, listTemplates, selectTemplate, sanitizeCompileCommand } from "../../src/templates.js";

test("adds a validated template only after a successful dummy compile and selects it", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-template-generator-"));
  try {
    const result = await addTemplate(root, { name: "modern-cv", filePath: join(root, "candidate.tex"), content: "\\documentclass{article}\\begin{document}{{name}}\\end{document}", compileCommand: "pdflatex --halt-on-error" }, { runner: async () => ({ stdout: "ok", stderr: "" }) });
    assert.equal(result.active, true);
    assert.equal((await selectTemplate(root, "modern-cv")).name, "modern-cv");
    assert.equal((await listTemplates(root)).some((item) => item.name === "modern-cv"), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects shell syntax, path escapes, and failed compile before activation", async () => {
  assert.deepEqual(sanitizeCompileCommand("pdflatex --halt-on-error"), ["pdflatex", "--halt-on-error"]);
  assert.throws(() => sanitizeCompileCommand("sh -c 'rm -rf .'"), /unsafe|allowlist/i);
  assert.throws(() => sanitizeCompileCommand("pdflatex && curl https://evil.example"), /unsafe/i);
  const root = await mkdtemp(join(tmpdir(), "pi-template-generator-"));
  try {
    await assert.rejects(() => addTemplate(root, { name: "broken", filePath: join(root, "candidate.tex"), content: "bad", compileCommand: "pdflatex" }, { runner: async () => { throw new Error("compile failed"); } }), /compile failed/);
    await assert.rejects(() => readFile(join(root, ".pi-job-search/templates/registry.json")));
  } finally { await rm(root, { recursive: true, force: true }); }
});
