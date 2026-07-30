import { applySetupPlan, buildSetupPlan, readProfileSection, type ProfileSection, type SectionName } from "./profile.js";

export type ExpansionStatus = "direct" | "inferred";
export type ExpansionConfidence = "low" | "medium" | "high";

export interface ExpansionSignal {
  id: string;
  section: SectionName;
  key: string;
  value: unknown;
  source: string;
  evidence: string;
  confidence: ExpansionConfidence;
  status: ExpansionStatus;
}

export interface ExpansionProposal extends ExpansionSignal {
  duplicate: false;
}

export interface ExpansionResult {
  approved: string[];
  skipped: string[];
  sections: Partial<Record<SectionName, ProfileSection>>;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right) || (typeof left === "string" && typeof right === "string" && left.trim().toLowerCase() === right.trim().toLowerCase());
}

function provenanceKind(source: string): "document" | "cv" | "interview" | "research" | "user" {
  if (/^https?:\/\//i.test(source)) return "research";
  if (/cv|resume/i.test(source)) return "cv";
  if (/interview/i.test(source)) return "interview";
  return "document";
}

export async function proposeExpansion(cwd: string, signals: ExpansionSignal[]): Promise<ExpansionProposal[]> {
  const sections = new Map<SectionName, ProfileSection>();
  for (const section of ["candidate", "behavioral", "writing", "search"] as SectionName[]) sections.set(section, await readProfileSection(cwd, section));
  return signals.filter((signal) => {
    const fields = sections.get(signal.section)?.fields ?? {};
    return !Object.values(fields).some((existing) => sameValue(existing.value, signal.value));
  }).map((signal) => ({ ...signal, duplicate: false as const }));
}

export async function applyExpansion(cwd: string, proposals: ExpansionProposal[], approvedIds: string[]): Promise<ExpansionResult> {
  const approved = proposals.filter((proposal) => approvedIds.includes(proposal.id));
  const skipped = proposals.filter((proposal) => !approvedIds.includes(proposal.id)).map((proposal) => proposal.id);
  const sections: Partial<Record<SectionName, ProfileSection>> = {};
  for (const proposal of approved) {
    const current = await readProfileSection(cwd, proposal.section);
    const plan = buildSetupPlan(proposal.section, { [proposal.key]: proposal.value }, {
      source: proposal.source,
      kind: provenanceKind(proposal.source),
      locator: proposal.evidence,
    }, current, "confirmed");
    const result = await applySetupPlan(cwd, plan, { approve: [proposal.key] });
    sections[proposal.section] = result.section;
  }
  return { approved: approved.map((proposal) => proposal.id), skipped, sections };
}
