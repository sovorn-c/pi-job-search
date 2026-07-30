import { appendOutcomeHistory } from "./archive.js";
import { readTracker, transitionStatus, upsertTracker, type ApplicationStatus, type TrackerRow } from "./tracker.js";

export interface OutcomeEvent {
  applicationKey: string;
  date: string;
  stage: string;
  status: ApplicationStatus;
  decision: string;
  evidence: string;
  notes: string;
}

function same(value: string | undefined, target: string): boolean {
  return value?.trim().toLocaleLowerCase() === target.trim().toLocaleLowerCase();
}

export async function selectApplication(cwd: string, companyOrKey: string, role?: string): Promise<TrackerRow> {
  const rows = await readTracker(cwd);
  const matches = rows.filter((row) => role
    ? (same(row.applicationKey, companyOrKey) || (same(row.company, companyOrKey) && same(row.role, role)))
    : same(row.applicationKey, companyOrKey) || same(row.company, companyOrKey));
  if (!matches.length) throw new Error("application not found");
  if (matches.length > 1) throw new Error("multiple applications match selector");
  return matches[0];
}

export async function recordOutcome(cwd: string, event: OutcomeEvent): Promise<TrackerRow> {
  const row = await selectApplication(cwd, event.applicationKey);
  transitionStatus(row.status, event.status);
  await appendOutcomeHistory(cwd, row.applicationKey, event);
  const notes = [row.notes, event.notes].filter(Boolean).join("\n");
  const updated: TrackerRow = { ...row, status: event.status, notes };
  await upsertTracker(cwd, updated);
  return updated;
}
