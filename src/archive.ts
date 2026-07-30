import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { WORKSPACE_DIR, writeJsonAtomic } from "./workspace.js";

export interface ArchivedFile {
  sourcePath: string;
  archivePath: string;
  sha256: string;
  bytes: number;
}

export interface ArchiveManifest {
  applicationKey: string;
  files: ArchivedFile[];
}

export interface OutcomeHistoryEntry {
  date: string;
  stage: string;
  status: string;
  decision: string;
  evidence: string;
  notes: string;
}

export function applicationArchivePath(cwd: string, applicationKey: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(applicationKey)) throw new Error("invalid application key");
  return join(resolve(cwd), WORKSPACE_DIR, "applications", applicationKey);
}

async function hashFile(path: string): Promise<{ sha256: string; bytes: number }> {
  const content = await readFile(path);
  return { sha256: createHash("sha256").update(content).digest("hex"), bytes: content.byteLength };
}

export async function archiveSubmittedMaterials(cwd: string, applicationKey: string, sourcePaths: string[]): Promise<ArchiveManifest> {
  const archive = applicationArchivePath(cwd, applicationKey);
  const submitted = join(archive, "submitted");
  await mkdir(submitted, { recursive: true });
  const files: ArchivedFile[] = [];
  for (const sourcePath of sourcePaths) {
    const source = resolve(sourcePath);
    const name = basename(source);
    if (name === "." || name === ".." || name !== basename(name)) throw new Error("invalid submitted filename");
    const destination = join(submitted, name);
    const sourceHash = await hashFile(source);
    try {
      await copyFile(source, destination, 1);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const archivedHash = await hashFile(destination);
      if (archivedHash.sha256 !== sourceHash.sha256) throw new Error(`immutable submitted file changed: ${name}`);
    }
    files.push({ sourcePath: source, archivePath: destination, ...sourceHash });
  }
  const manifest = { applicationKey, files };
  await writeJsonAtomic(join(archive, "submitted-manifest.json"), manifest);
  return manifest;
}

export async function appendOutcomeHistory(cwd: string, applicationKey: string, entry: OutcomeHistoryEntry): Promise<string> {
  const archive = applicationArchivePath(cwd, applicationKey);
  await mkdir(archive, { recursive: true });
  const path = join(archive, "outcome.md");
  const block = `\n## ${entry.date} — ${entry.stage}\n\n- Status: ${entry.status}\n- Decision: ${entry.decision}\n- Evidence: ${entry.evidence}\n\n${entry.notes}\n`;
  await writeFile(path, block, { encoding: "utf8", flag: "a" });
  return path;
}
