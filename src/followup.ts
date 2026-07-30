import { mkdir, writeFile } from "node:fs/promises";
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
  if (input.existingCount >= 2) throw new Error("two follow-ups already exist");
  const facts = new Set(input.facts.map((fact) => fact.toLocaleLowerCase()));
  for (const claim of input.requestedClaims) if (!facts.has(claim.toLocaleLowerCase())) throw new Error(`unsupported claim: ${claim}`);
  const archive = applicationArchivePath(input.cwd, input.applicationKey);
  await mkdir(archive, { recursive: true });
  const kindTitle = input.kind === "thank-you" ? "Thank you" : "Follow-up";
  const factText = input.requestedClaims.length ? `\n\nRelevant approved facts:\n${input.requestedClaims.map((claim) => `- ${claim}`).join("\n")}` : "";
  const body = `# ${kindTitle}: ${input.role} at ${input.company}\n\n${input.kind === "thank-you" ? "Thank you for taking the time to speak with me." : "I am following up on my application and remain interested in the role."}${factText}\n\nDraft only — review before any manual use.\n`;
  const path = join(archive, `followup-${input.date}.md`);
  await writeFile(path, body, { encoding: "utf8", flag: "wx" });
  return { path, kind: input.kind, draftOnly: true };
}
