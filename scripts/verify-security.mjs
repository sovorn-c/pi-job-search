import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const lifecycle = Object.keys(manifest.scripts ?? {}).filter((key) => /^(pre|post)?(install|prepare|publish|pack|restart|start|stop|version)$/.test(key));
assert.deepEqual(lifecycle, [], "package lifecycle scripts are not allowed");
const { stdout } = await exec("npm", ["pack", "--dry-run", "--json"], { cwd: root, env: { ...process.env, npm_config_loglevel: "silent" } });
const files = JSON.parse(stdout)[0].files.map(({ path }) => path);
const forbiddenPaths = files.filter((path) => /(^|\/)(?:\.env|\.pi-job-search|specs|test|coverage|node_modules)(?:\/|$)|\.pem$|\.key$/.test(path));
assert.deepEqual(forbiddenPaths, [], `private files would ship: ${forbiddenPaths.join(", ")}`);
const suspicious = [];
for (const path of files.filter((item) => /\.(?:ts|js|md|json|tex)$/.test(item))) {
  const content = await readFile(join(root, path), "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:AKIA|ASIA)[A-Z0-9]{16}|Bearer\s+[A-Za-z0-9._-]{20,}/.test(content)) suspicious.push(path);
}
assert.deepEqual(suspicious, [], `possible secret in package: ${suspicious.join(", ")}`);
const gmail = await readFile(join(root, "src/gmail.ts"), "utf8");
assert.doesNotMatch(gmail, /\.\s*(?:send|delete|modify|trash|label)\s*\(/i, "Gmail connector must stay read-only");
console.log(`security verification passed (${files.length} package files)`);
