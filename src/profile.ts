import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { initializeWorkspace, writeJsonAtomic, WORKSPACE_DIR } from "./workspace.js";

const execFile = promisify(execFileCallback);
const PROFILE_DIR = "profile";
const DOCUMENTS_DIR = "documents";
const SECTION_NAMES = ["candidate", "behavioral", "writing", "search"] as const;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json", ".csv", ".tex"]);

export type SectionName = (typeof SECTION_NAMES)[number];
export type ProvenanceKind = "document" | "cv" | "interview" | "user";
export type FactStatus = "confirmed" | "inferred";

export interface Provenance {
  source: string;
  kind: ProvenanceKind;
  locator?: string;
}

export interface ProfileFact {
  value: unknown;
  status: FactStatus;
  provenance: Provenance[];
}

export interface ProfileSection {
  schemaVersion: 1;
  section: SectionName;
  version: number;
  fields: Record<string, ProfileFact>;
}

export interface DocumentEntry {
  path: string;
  relativePath: string;
  format: string;
  bytes: number;
}

export interface ExtractionResult {
  path: string;
  status: "extracted" | "unsupported" | "unreadable";
  text?: string;
  error?: string;
}

export interface SetupChange {
  key: string;
  incoming: ProfileFact;
  existing?: ProfileFact;
}

export interface SetupPlan {
  section: SectionName;
  additions: SetupChange[];
  conflicts: SetupChange[];
  written: false;
}

export interface ApplySetupOptions {
  approve: string[];
  resolve?: Record<string, "keep" | "replace" | "skip">;
}

export function emptyProfileSection(section: SectionName): ProfileSection {
  return { schemaVersion: 1, section, version: 0, fields: {} };
}

export function validateProfileSection(value: unknown): value is ProfileSection {
  if (!value || typeof value !== "object") return false;
  const section = value as Partial<ProfileSection>;
  if (section.schemaVersion !== 1 || !SECTION_NAMES.includes(section.section as SectionName)) return false;
  if (!Number.isInteger(section.version) || (section.version ?? -1) < 0 || !section.fields) return false;
  return Object.values(section.fields).every((fact) => {
    if (!fact || typeof fact !== "object" || !Array.isArray(fact.provenance)) return false;
    return (fact.status === "confirmed" || fact.status === "inferred") &&
      fact.provenance.length > 0 &&
      fact.provenance.every((source) => typeof source.source === "string" && source.source.length > 0);
  });
}

function fact(value: unknown, provenance: Provenance, status: FactStatus = "confirmed"): ProfileFact {
  return { value, status, provenance: [provenance] };
}

export function normalizeFacts(
  values: Record<string, unknown>,
  provenance: Provenance,
  status: FactStatus = "confirmed",
): Record<string, ProfileFact> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fact(value, provenance, status)]));
}

function profilePath(cwd: string, section: SectionName): string {
  return join(resolve(cwd), WORKSPACE_DIR, PROFILE_DIR, `${section}.json`);
}

export function resolveStatePath(cwd: string, child: string): string {
  const root = resolve(cwd, WORKSPACE_DIR);
  const target = resolve(root, child);
  const remainder = relative(root, target);
  if (isAbsolute(remainder) || remainder === ".." || remainder.startsWith(`..${requireSeparator()}`)) {
    throw new Error("path is outside workspace state root");
  }
  return target;
}

function requireSeparator(): string {
  return process.platform === "win32" ? "\\" : "/";
}

export async function readProfileSection(cwd: string, section: SectionName): Promise<ProfileSection> {
  const path = profilePath(cwd, section);
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!validateProfileSection(parsed)) throw new Error(`invalid ${section} profile schema`);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyProfileSection(section);
    throw error;
  }
}

export async function writeProfileSection(
  cwd: string,
  section: SectionName,
  values: Record<string, unknown>,
  provenance: Provenance,
  expectedVersion: number,
  status: FactStatus = "confirmed",
): Promise<ProfileSection> {
  await initializeWorkspace(cwd);
  const current = await readProfileSection(cwd, section);
  if (current.version !== expectedVersion) throw new Error(`version conflict for ${section}`);
  const next: ProfileSection = {
    ...current,
    version: current.version + 1,
    fields: { ...current.fields, ...normalizeFacts(values, provenance, status) },
  };
  await writeJsonAtomic(profilePath(cwd, section), next);
  return next;
}

export async function updateProfileSection(
  cwd: string,
  section: SectionName,
  values: Record<string, unknown>,
  expectedVersion: number,
): Promise<ProfileSection> {
  return writeProfileSection(cwd, section, values, { source: "user", kind: "user" }, expectedVersion);
}

function fieldsOf(existing: ProfileSection | Record<string, ProfileFact>): Record<string, ProfileFact> {
  return "schemaVersion" in existing ? (existing as ProfileSection).fields : (existing as Record<string, ProfileFact>);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildSetupPlan(
  section: SectionName,
  values: Record<string, unknown>,
  provenance: Provenance,
  existing: ProfileSection | Record<string, ProfileFact> = emptyProfileSection(section),
  status: FactStatus = "confirmed",
): SetupPlan {
  const current = fieldsOf(existing);
  const incoming = normalizeFacts(values, provenance, status);
  const additions: SetupChange[] = [];
  const conflicts: SetupChange[] = [];
  for (const [key, next] of Object.entries(incoming)) {
    if (!current[key]) additions.push({ key, incoming: next });
    else if (!sameValue(current[key].value, next.value)) conflicts.push({ key, incoming: next, existing: current[key] });
  }
  return { section, additions, conflicts, written: false };
}

export async function applySetupPlan(
  cwd: string,
  plan: SetupPlan,
  options: ApplySetupOptions,
): Promise<{ written: boolean; section: ProfileSection }> {
  const current = await readProfileSection(cwd, plan.section);
  const fields = { ...current.fields };
  for (const change of plan.additions) {
    if (options.approve.includes(change.key)) fields[change.key] = change.incoming;
  }
  for (const change of plan.conflicts) {
    if (options.resolve?.[change.key] === "replace") fields[change.key] = change.incoming;
  }
  const changed = JSON.stringify(fields) !== JSON.stringify(current.fields);
  if (!changed) return { written: false, section: current };
  const next = { ...current, version: current.version + 1, fields };
  await initializeWorkspace(cwd);
  await writeJsonAtomic(profilePath(cwd, plan.section), next);
  return { written: true, section: next };
}

export async function setupFromCv(cwd: string, values: Record<string, unknown>, source: string): Promise<SetupPlan> {
  return buildSetupPlan("candidate", values, { source, kind: "cv" }, await readProfileSection(cwd, "candidate"));
}

export async function setupFromDocuments(cwd: string, values: Record<string, unknown>, source: string): Promise<SetupPlan> {
  return buildSetupPlan("candidate", values, { source, kind: "document" }, await readProfileSection(cwd, "candidate"));
}

export async function setupFromInterview(cwd: string, values: Record<string, unknown>): Promise<SetupPlan> {
  return buildSetupPlan("candidate", values, { source: "interview", kind: "interview" }, await readProfileSection(cwd, "candidate"));
}

function documentsRoot(cwd: string): string {
  return resolve(cwd, WORKSPACE_DIR, DOCUMENTS_DIR);
}

function ensureWithin(root: string, target: string): void {
  const remainder = relative(resolve(root), resolve(target));
  if (isAbsolute(remainder) || remainder === ".." || remainder.startsWith(`..${requireSeparator()}`)) {
    throw new Error("path is outside workspace");
  }
}

async function walk(root: string, current: string, entries: DocumentEntry[]): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) await walk(root, path, entries);
    else if (entry.isFile()) {
      const details = await stat(path);
      entries.push({ path, relativePath: relative(root, path), format: extname(path).slice(1).toLowerCase(), bytes: details.size });
    }
  }
}

export async function inventoryDocuments(cwd: string): Promise<DocumentEntry[]> {
  const root = documentsRoot(cwd);
  try {
    await access(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const entries: DocumentEntry[] = [];
  await walk(root, root, entries);
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function extractDocument(cwd: string, path: string): Promise<ExtractionResult> {
  const root = documentsRoot(cwd);
  const target = resolve(path);
  ensureWithin(root, target);
  const extension = extname(target).toLowerCase();
  ensureWithin(await realpath(root), await realpath(target));
  try {
    if (TEXT_EXTENSIONS.has(extension)) return { path: target, status: "extracted", text: await readFile(target, "utf8") };
    if (extension === ".pdf") {
      const result = await execFile("pdftotext", [target, "-"], { timeout: 5000, maxBuffer: 2_000_000 });
      return { path: target, status: "extracted", text: result.stdout };
    }
    return { path: target, status: "unsupported" };
  } catch (error) {
    return { path: target, status: "unreadable", error: error instanceof Error ? error.message : "read failed" };
  }
}

export interface ConsistencyIssue {
  type: "missing" | "inferred" | "invalid";
  section: SectionName;
  key?: string;
  message: string;
}

export async function checkProfileConsistency(cwd: string): Promise<{ ok: boolean; issues: ConsistencyIssue[] }> {
  const issues: ConsistencyIssue[] = [];
  for (const section of SECTION_NAMES) {
    try {
      const value = await readProfileSection(cwd, section);
      if (Object.keys(value.fields).length === 0) issues.push({ type: "missing", section, message: `${section} profile is empty` });
      for (const [key, field] of Object.entries(value.fields)) {
        if (field.status === "inferred") issues.push({ type: "inferred", section, key, message: `${section}.${key} needs confirmation` });
      }
    } catch (error) {
      issues.push({ type: "invalid", section, message: error instanceof Error ? error.message : "invalid profile" });
    }
  }
  return { ok: issues.length === 0, issues };
}

export type ResetMode = "profile" | "documents" | "all";

async function listPaths(root: string): Promise<string[]> {
  try {
    const names = await readdir(root, { withFileTypes: true });
    const paths: string[] = [];
    for (const entry of names) {
      const path = join(root, entry.name);
      paths.push(path);
      if (entry.isDirectory()) paths.push(...await listPaths(path));
    }
    return paths;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function resetTarget(cwd: string, mode: ResetMode): string {
  if (mode === "profile") return resolveStatePath(cwd, PROFILE_DIR);
  if (mode === "documents") return resolveStatePath(cwd, DOCUMENTS_DIR);
  return resolve(cwd, WORKSPACE_DIR);
}

export async function previewReset(cwd: string, mode: ResetMode): Promise<{ mode: ResetMode; paths: string[] }> {
  const target = resetTarget(cwd, mode);
  return { mode, paths: await listPaths(target) };
}

export async function executeReset(cwd: string, mode: ResetMode, confirmation: string): Promise<{ executed: boolean; paths: string[] }> {
  const preview = await previewReset(cwd, mode);
  if (confirmation !== "RESET") return { executed: false, paths: preview.paths };
  const target = resetTarget(cwd, mode);
  if (mode === "all") {
    for (const entry of await readdir(target, { withFileTypes: true })) await rm(join(target, entry.name), { recursive: true, force: true });
    await initializeWorkspace(cwd);
  } else {
    await rm(target, { recursive: true, force: true });
  }
  return { executed: true, paths: preview.paths };
}
