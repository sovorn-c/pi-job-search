import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getCapabilities } from "./package-resources.js";

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv[0] !== "capabilities") {
    console.error("Usage: npm run cli -- capabilities");
    return 2;
  }

  console.log(JSON.stringify(await getCapabilities()));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
