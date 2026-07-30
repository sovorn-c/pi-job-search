import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { WORKSPACE_DIR } from "./workspace.js";

export type ApplicationStatus = "discovered" | "drafted" | "applied" | "acknowledged" | "interview" | "offer" | "hired" | "rejected" | "no-response" | "follow-up" | "offer-declined" | "withdrawn";

export interface TrackerRow {
  applicationKey: string;
  company: string;
  role: string;
  url: string;
  status: ApplicationStatus;
  appliedAt?: string;
  notes?: string;
  cvFile?: string;
  coverLetterFile?: string;
  [key: string]: string | undefined;
}

const COLUMNS = ["applicationKey", "company", "role", "url", "status", "appliedAt", "notes", "cvFile", "coverLetterFile", "date", "sector", "channel", "source"];
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  discovered: ["drafted", "applied", "withdrawn"], drafted: ["applied", "withdrawn"], applied: ["acknowledged", "interview", "offer", "rejected", "no-response", "withdrawn"],
  acknowledged: ["interview", "offer", "rejected", "no-response", "withdrawn"], interview: ["offer", "rejected", "no-response", "withdrawn"], offer: ["hired", "offer-declined", "withdrawn"],
  "no-response": ["follow-up", "rejected"], "follow-up": ["interview", "no-response", "rejected"], hired: [], rejected: [], "offer-declined": [], withdrawn: [],
};

function csvPath(cwd: string): string {
  return join(resolve(cwd), WORKSPACE_DIR, "applications", "tracker.csv");
}

function escapeCsv(value: string | undefined): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field.length || row.length) { row.push(field); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

export function stableApplicationKey(company: string, role: string): string {
  return `${company}_${role}`.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase().slice(0, 160);
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return from === to || TRANSITIONS[from]?.includes(to) === true;
}

export function transitionStatus(from: ApplicationStatus, to: ApplicationStatus): ApplicationStatus {
  if (!canTransition(from, to)) throw new Error(`invalid status transition: ${from} -> ${to}`);
  return to;
}

export async function readTracker(cwd: string): Promise<TrackerRow[]> {
  try { await access(csvPath(cwd)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const rows = parseCsv(await readFile(csvPath(cwd), "utf8"));
  if (!rows.length) return [];
  const [header, ...data] = rows;
  return data.map((values) => {
    const row = Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])) as TrackerRow;
    if (!TRANSITIONS[row.status]) throw new Error(`invalid tracker status: ${row.status}`);
    return row;
  });
}

export async function writeTracker(cwd: string, rows: TrackerRow[]): Promise<void> {
  for (const row of rows) {
    if (row.applicationKey !== stableApplicationKey(row.company, row.role)) throw new Error("application key does not match company and role");
    if (!TRANSITIONS[row.status]) throw new Error(`invalid tracker status: ${row.status}`);
  }
  const columns = COLUMNS.filter((column) => column === "applicationKey" || column === "company" || column === "role" || column === "url" || column === "status" || rows.some((row) => row[column] !== undefined));
  const content = `${columns.join(",")}\n${rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(",")).join("\n")}${rows.length ? "\n" : ""}`;
  const path = csvPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, content, { encoding: "utf8", flag: "wx" }); await rename(temporary, path); } finally { await rm(temporary, { force: true }); }
}

export function upsertTrackerRow(rows: TrackerRow[], incoming: TrackerRow): TrackerRow[] {
  if (incoming.applicationKey !== stableApplicationKey(incoming.company, incoming.role)) throw new Error("application key does not match company and role");
  const index = rows.findIndex((row) => row.applicationKey === incoming.applicationKey);
  if (index < 0) return [...rows, { ...incoming }];
  transitionStatus(rows[index].status, incoming.status);
  const next = [...rows];
  next[index] = { ...rows[index], ...incoming };
  return next;
}

export async function upsertTracker(cwd: string, incoming: TrackerRow): Promise<TrackerRow[]> {
  const rows = upsertTrackerRow(await readTracker(cwd), incoming);
  await writeTracker(cwd, rows);
  return rows;
}
