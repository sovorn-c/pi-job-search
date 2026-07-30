import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const cwd = fileURLToPath(new URL("..", import.meta.url));
for (const script of ["verify:ci", "verify:generators", "verify:setup", "verify:scrape", "verify:apply", "verify:outcome-interview", "verify:insights", "verify:integrations"]) {
  await exec("npm", ["run", script], { cwd, maxBuffer: 8_000_000 });
}
console.log("release verification passed");
