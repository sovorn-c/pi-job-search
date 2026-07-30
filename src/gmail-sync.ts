import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { extractMessageText, getMessageHeader, listAllMessages, type GmailClient, type GmailMessage } from "./gmail.js";
import { readTracker, type TrackerRow } from "./tracker.js";
import { recordOutcome } from "./outcome.js";
import { writeJsonAtomic, WORKSPACE_DIR } from "./workspace.js";

export type GmailSyncClient = GmailClient;
export type GmailSyncMessage = GmailMessage;
export type GmailSignal = "acknowledgement" | "interview" | "offer" | "rejection" | "none";

export interface GmailState {
  schemaVersion: 1;
  processedIds: string[];
  lastSync?: string;
  lastQuery?: string;
}

export interface GmailProposal {
  messageId: string;
  signal: Exclude<GmailSignal, "acknowledgement" | "none">;
  applicationKey?: string;
  candidates: string[];
  ambiguous: boolean;
  subject: string;
  date: string;
  evidence: string;
}

export interface GmailSyncOptions {
  query?: string;
  company?: string;
  confirmation?: "APPROVE" | "REJECT";
}

export interface GmailSyncResult {
  authorized: boolean;
  needsApproval: boolean;
  message: string;
  processedCount: number;
  proposals: GmailProposal[];
  applied: string[];
  errors: string[];
}

function statePath(cwd: string): string {
  return join(resolve(cwd), WORKSPACE_DIR, "integrations", "gmail.json");
}

export async function readGmailState(cwd: string): Promise<GmailState> {
  try {
    const value = JSON.parse(await readFile(statePath(cwd), "utf8")) as Partial<GmailState>;
    if (value.schemaVersion !== 1 || !Array.isArray(value.processedIds) || value.processedIds.some((id) => typeof id !== "string")) throw new Error("invalid Gmail state");
    return { schemaVersion: 1, processedIds: value.processedIds, lastSync: value.lastSync, lastQuery: value.lastQuery };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, processedIds: [] };
    throw error;
  }
}

async function writeGmailState(cwd: string, state: GmailState): Promise<void> {
  await writeJsonAtomic(statePath(cwd), state);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function classifyGmailMessage(message: GmailMessage): GmailSignal {
  const subject = getMessageHeader(message, "subject") ?? "";
  const text = `${subject}\n${extractMessageText(message)}`;
  if (/offer|pleased to offer|employment agreement/i.test(text)) return "offer";
  if (/not moving forward|rejected|unsuccessful|decline|no longer consider/i.test(text)) return "rejection";
  if (/interview|technical round|schedule (?:a |an )?(?:call|screen|conversation)|meet with/i.test(text)) return "interview";
  if (/application received|received your application|thank you for applying|acknowledge receipt/i.test(text)) return "acknowledgement";
  return "none";
}

function messageDate(message: GmailMessage): string {
  return getMessageHeader(message, "date") ?? (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : "unknown date");
}

function matchMessage(message: GmailMessage, rows: TrackerRow[], companyFilter?: string): { applicationKey?: string; candidates: string[]; ambiguous: boolean } {
  const subject = getMessageHeader(message, "subject") ?? "";
  const text = normalize(`${subject} ${extractMessageText(message)}`);
  const candidates = rows.filter((row) => !companyFilter || normalize(row.company) === normalize(companyFilter)).filter((row) => text.includes(normalize(row.company))).map((row) => row);
  const exact = candidates.filter((row) => text.includes(normalize(row.role)));
  if (exact.length === 1) return { applicationKey: exact[0].applicationKey, candidates: exact.map((row) => row.applicationKey), ambiguous: false };
  return { candidates: candidates.map((row) => row.applicationKey), ambiguous: true };
}

function toStatus(signal: GmailProposal["signal"]): "interview" | "offer" | "rejected" {
  return signal === "rejection" ? "rejected" : signal;
}

export async function syncGmail(cwd: string, client: GmailSyncClient | undefined, options: GmailSyncOptions): Promise<GmailSyncResult> {
  if (!client) return { authorized: false, needsApproval: false, message: "Gmail authorization is not configured; no local state changed.", processedCount: 0, proposals: [], applied: [], errors: [] };
  const state = await readGmailState(cwd);
  const processed = new Set(state.processedIds);
  const refs = await listAllMessages(client, options.query ?? "", 500);
  const newRefs = refs.filter((ref) => !processed.has(ref.id));
  const messages = await Promise.all(newRefs.map((ref) => client.get(ref.id)));
  const rows = await readTracker(cwd);
  const proposals: GmailProposal[] = [];
  for (const message of messages) {
    const signal = classifyGmailMessage(message);
    if (signal === "none" || signal === "acknowledgement") continue;
    const subject = getMessageHeader(message, "subject") ?? "(no subject)";
    const date = messageDate(message);
    const text = extractMessageText(message).replace(/\s+/g, " ").trim();
    const match = matchMessage(message, rows, options.company);
    proposals.push({ messageId: message.id, signal, ...match, subject, date, evidence: `${subject} — ${date}: ${text.slice(0, 280)}` });
  }
  if (!options.confirmation) return { authorized: true, needsApproval: proposals.length > 0, message: proposals.length ? "Gmail signals found; explicit batch approval is required." : "No actionable Gmail signals found.", processedCount: messages.length, proposals, applied: [], errors: [] };
  const nextState: GmailState = { schemaVersion: 1, processedIds: [...new Set([...state.processedIds, ...newRefs.map((ref) => ref.id)])], lastSync: new Date().toISOString(), lastQuery: options.query ?? "" };
  const applied: string[] = [];
  const errors: string[] = [];
  if (options.confirmation === "APPROVE") {
    for (const proposal of proposals) {
      if (!proposal.applicationKey || proposal.ambiguous) continue;
      try {
        await recordOutcome(cwd, { applicationKey: proposal.applicationKey, date: proposal.date, stage: `gmail-${proposal.signal}`, status: toStatus(proposal.signal), decision: "approved-gmail-signal", evidence: proposal.evidence, notes: "Status reconciled from approved Gmail signal." });
        if (!applied.includes(proposal.applicationKey)) applied.push(proposal.applicationKey);
      } catch (error) { errors.push(`${proposal.messageId}: ${(error as Error).message}`); }
    }
  }
  await writeGmailState(cwd, nextState);
  return { authorized: true, needsApproval: false, message: options.confirmation === "REJECT" ? "Gmail batch rejected; local tracker unchanged." : "Approved Gmail signals applied; ambiguous signals remain proposals.", processedCount: messages.length, proposals, applied, errors };
}
