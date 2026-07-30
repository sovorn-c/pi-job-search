import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const WORKSPACE_DIR = ".pi-job-search";
const STATE_DIRECTORIES = ["profile", "search", "applications", "reports", "integrations", "documents"];

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function ensureIgnoreRule(cwd: string): Promise<void> {
  const path = join(cwd, ".gitignore");
  let content = "";
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (content.split(/\r?\n/).includes(`${WORKSPACE_DIR}/`)) return;
  const prefix = content && !content.endsWith("\n") ? `${content}\n` : content;
  await writeFile(path, `${prefix}${WORKSPACE_DIR}/\n`, "utf8");
}

export async function initializeWorkspace(cwd = process.cwd()): Promise<{ root: string }> {
  const root = join(resolve(cwd), WORKSPACE_DIR);
  await mkdir(root, { recursive: true });
  await Promise.all(STATE_DIRECTORIES.map((directory) => mkdir(join(root, directory), { recursive: true })));

  const configPath = join(root, "config.json");
  try {
    await access(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeJsonAtomic(configPath, { schemaVersion: 1 });
  }

  await ensureIgnoreRule(resolve(cwd));
  return { root };
}
