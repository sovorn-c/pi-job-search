import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const cwd = fileURLToPath(new URL("..", import.meta.url));
await exec("npx", ["tsx", "--test", "test/generators/templates.test.ts", "test/generators/portal-policy.test.ts", "test/generators/portal-scaffold.test.ts"], { cwd, maxBuffer: 4_000_000 });
console.log("generator verification passed");
