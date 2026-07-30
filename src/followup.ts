import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applicationArchivePath } from "./archive.js";

export type FollowupKind = "thank-you" | "follow-up";

export interface FollowupInput {
  cwd: string;
  applicationKey: string;
  company: string;
  role: string;
  date: string;
  kind: FollowupKind;
  facts: string[];
  requestedClaims: string[];
  existingCount: number;
}

export interface FollowupDraft {
  path: string;
  kind: FollowupKind;
  draftOnly: true;
}

export async function draftFollowup(input: FollowupInput): Promise<FollowupDraft> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("invalid follow-up date");
  const archive = applicationArchivePath(input.cwd, input.applicationKey);
  let existingFiles = 0;
  try { existingFiles = (await readdir(archive)).filter((name) => /^followup-\d{4}-\d{2}-\d{2}\.md$/.test(name)).length; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (Math.max(input.existingCount, existingFiles) >= 2) throw new Error("two follow-ups already exist");
  const facts = new Set(input.facts.map((fact) => fact.toLocaleLowerCase()));
  for (const claim of input.requestedClaims) if (!facts.has(claim.toLocaleLowerCase())) throw new Error(`unsupported claim: ${claim}`);
  await mkdir(archive, { recursive: true });
  const kindTitle = input.kind === "thank-you" ? "Thank you" : "Follow-up";
  const factText = input.requestedClaims.length ? `\n\nRelevant approved facts:\n${input.requestedClaims.map((claim) => `- ${claim}`).join("\n")}` : "";
  const body = `# ${kindTitle}: ${input.role} at ${input.company}\n\n${input.kind === "thank-you" ? "Thank you for taking the time to speak with me." : "I am following up on my application and remain interested in the role."}${factText}\n\nDraft only — review before any manual use.\n`;
  const path = join(archive, `followup-${input.date}.md`);
  await writeFile(path, body, { encoding: "utf8", flag: "wx" });
  return { path, kind: input.kind, draftOnly: true };
}
