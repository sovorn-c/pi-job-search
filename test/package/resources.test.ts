import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);

test("package manifest declares the Pi resource surface", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

  assert.ok(manifest.keywords.includes("pi-package"));
  assert.deepEqual(manifest.pi, {
    extensions: ["./extensions"],
    skills: ["./skills"],
    prompts: ["./prompts"],
  });
});
