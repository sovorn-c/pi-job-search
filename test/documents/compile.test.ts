import assert from "node:assert/strict";
import test from "node:test";
import { compileLatex } from "../../src/documents.js";

test("compile result records output PDF and command metadata", async () => {
  const result = await compileLatex("/workspace/.pi-job-search/applications/acme/cv.tex", { cwd: "/workspace", runner: async () => ({ stdout: "", stderr: "" }) });
  assert.equal(result.pdfPath, "/workspace/.pi-job-search/applications/acme/cv.pdf");
  assert.deepEqual(result.args.slice(0, 2), ["-interaction=nonstopmode", "-halt-on-error"]);
});
