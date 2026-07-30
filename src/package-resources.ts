import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function getCapabilities() {
  const manifest = JSON.parse(
    await readFile(resolve(packageRoot, "package.json"), "utf8"),
  ) as { name: string };
  const promptFiles = await readdir(resolve(packageRoot, "prompts"));
  const skillDirectories = await readdir(resolve(packageRoot, "skills"), {
    withFileTypes: true,
  });

  return {
    package: manifest.name,
    commands: promptFiles
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.slice(0, -3))
      .sort(),
    skills: skillDirectories
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
  };
}
