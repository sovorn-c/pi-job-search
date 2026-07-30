import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initializeWorkspace, writeJsonAtomic, WORKSPACE_DIR } from "./workspace.js";

export type RequirementKind = "required" | "preferred";
export type RequirementStatus = "met" | "gap";

export interface Requirement {
  id: string;
  kind: RequirementKind;
  text: string;
}

export interface EvaluatedRequirement extends Requirement {
  status: RequirementStatus;
}

export interface PostingEvaluationInput {
  postingText: string;
  workRights: "PASS" | "FAIL" | "UNKNOWN";
  location: "PASS" | "FAIL" | "FLAG" | "UNKNOWN";
  requirements: Requirement[];
  candidateSkills: string[];
}

export interface PostingEvaluation {
  eligible: boolean;
  blocking: string[];
  requirements: EvaluatedRequirement[];
  gaps: EvaluatedRequirement[];
  postingText: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

export function normalizePostingText(posting: string): string {
  return posting
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/ignore (?:all )?previous|call job_search|execute tool|system message/i.test(line))
    .join("\n");
}

export function extractRequirements(posting: string): Requirement[] {
  const requirements: Requirement[] = [];
  for (const line of normalizePostingText(posting).split(/\r?\n/)) {
    const match = line.match(/^(?:[-*]\s*)?(required|must have|must|required skill|nice to have|preferred|bonus)\s*:\s*(.+)$/i);
    if (!match) continue;
    const text = match[2].trim();
    if (!text) continue;
    const kind: RequirementKind = /nice to have|preferred|bonus/i.test(match[1]) ? "preferred" : "required";
    requirements.push({ id: `requirement-${requirements.length + 1}`, kind, text });
  }
  return requirements;
}

export function evaluatePosting(input: PostingEvaluationInput): PostingEvaluation {
  const candidateSkills = new Set(input.candidateSkills.map(normalize));
  const requirements = input.requirements.map((requirement) => ({
    ...requirement,
    status: candidateSkills.has(normalize(requirement.text)) ? "met" as const : "gap" as const,
  }));
  const blocking: string[] = [];
  if (input.workRights !== "PASS") blocking.push(input.workRights === "FAIL" ? "work-rights-fail" : "work-rights-unknown");
  if (input.location === "FAIL") blocking.push("location-fail");
  if (input.location === "UNKNOWN") blocking.push("location-unknown");
  const gaps = requirements.filter((requirement) => requirement.status === "gap");
  return {
    eligible: blocking.length === 0,
    blocking,
    requirements,
    gaps,
    postingText: normalizePostingText(input.postingText),
  };
}

export type ApprovedFactSource = "approved-profile" | "base-cv" | "approved-workspace";

export interface ApprovedFact {
  id: string;
  key: string;
  value: unknown;
  source: ApprovedFactSource;
  provenance: string;
}

export interface DraftClaim {
  id: string;
  key: string;
  value: unknown;
  text: string;
  factIds: string[];
}

export interface GroundedClaim extends DraftClaim {
  status: "grounded" | "blocked";
}

export interface GroundingIssue {
  claimId: string;
  reason: "unsupported" | "contradiction";
  message: string;
}

export interface GroundingResult {
  blocked: boolean;
  claims: GroundedClaim[];
  blocking: GroundingIssue[];
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function groundClaims(claims: DraftClaim[], facts: ApprovedFact[]): GroundingResult {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const grounded: GroundedClaim[] = [];
  const blocking: GroundingIssue[] = [];
  for (const claim of claims) {
    const linked = claim.factIds.map((id) => byId.get(id)).filter((fact): fact is ApprovedFact => Boolean(fact));
    const matchingKey = linked.find((fact) => fact.key === claim.key);
    if (!matchingKey) {
      blocking.push({ claimId: claim.id, reason: "unsupported", message: `${claim.id} has no approved supporting fact` });
      grounded.push({ ...claim, status: "blocked" });
    } else if (!sameValue(matchingKey.value, claim.value)) {
      blocking.push({ claimId: claim.id, reason: "contradiction", message: `${claim.id} conflicts with ${matchingKey.provenance}` });
      grounded.push({ ...claim, status: "blocked" });
    } else {
      grounded.push({ ...claim, status: "grounded" });
    }
  }
  return { blocked: blocking.length > 0, claims: grounded, blocking };
}

export interface ApplicationInput {
  cwd: string;
  company: string;
  title: string;
  url: string;
  postingText: string;
  evaluation: PostingEvaluation;
  claims: DraftClaim[];
  facts: ApprovedFact[];
  confirmation?: "PROCEED";
}

export type ApplicationPlan =
  | { status: "blocked"; reason: string }
  | { status: "confirmation-required" }
  | { status: "ready" };

export function planApplication(input: ApplicationInput): ApplicationPlan {
  if (!input.evaluation.eligible) return { status: "blocked", reason: input.evaluation.blocking[0] ?? "ineligible" };
  if (input.confirmation !== "PROCEED") return { status: "confirmation-required" };
  return { status: "ready" };
}

function archiveSlug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "application";
}

export interface ApplicationArchive {
  directory: string;
  draftOnly: true;
  files: string[];
}

export interface ReviewerSnapshot {
  postingText: string;
  company: string;
  claims: DraftClaim[];
  evaluation: PostingEvaluation;
}

export interface ReviewerReplacement {
  claimId: string;
  text: string;
  value: unknown;
  factIds: string[];
  rationale: string;
}

export interface ReviewerCompanyClaim {
  text: string;
  sources: string[];
}

export interface ReviewerReport {
  replacements: ReviewerReplacement[];
  companyClaims: ReviewerCompanyClaim[];
  notes: string[];
}

export type IsolatedReviewer = (snapshot: ReviewerSnapshot) => Promise<ReviewerReport>;

export async function runIsolatedReview(snapshot: ReviewerSnapshot, reviewer: IsolatedReviewer): Promise<ReviewerReport> {
  const isolatedSnapshot = JSON.parse(JSON.stringify(snapshot)) as ReviewerSnapshot;
  return reviewer(isolatedSnapshot);
}

export interface ReviewerAuditEntry {
  claimId: string;
  replacement: string;
  rationale: string;
}

export interface ReviewerEditResult {
  blocked: boolean;
  claims: DraftClaim[];
  audit: ReviewerAuditEntry[];
  blocking: string[];
}

export function applyReviewerEdits(
  claims: DraftClaim[],
  report: ReviewerReport,
  facts: ApprovedFact[],
  postingUrl: string,
): ReviewerEditResult {
  const next = claims.map((claim) => ({ ...claim, factIds: [...claim.factIds] }));
  const audit: ReviewerAuditEntry[] = [];
  const blocking: string[] = [];
  for (const replacement of report.replacements) {
    const index = next.findIndex((claim) => claim.id === replacement.claimId);
    if (index < 0) {
      blocking.push(`unknown-claim:${replacement.claimId}`);
      continue;
    }
    const candidate = { ...next[index], text: replacement.text, value: replacement.value, factIds: replacement.factIds };
    if (groundClaims([candidate], facts).blocked) {
      blocking.push(`ungrounded-replacement:${replacement.claimId}`);
      continue;
    }
    next[index] = candidate;
    audit.push({ claimId: replacement.claimId, replacement: replacement.text, rationale: replacement.rationale });
  }
  for (const companyClaim of report.companyClaims) {
    const independent = companyClaim.sources.some((source) => {
      try {
        return new URL(source).href !== new URL(postingUrl).href && /^https?:$/.test(new URL(source).protocol);
      } catch {
        return false;
      }
    });
    if (!independent) blocking.push("company-claim-unverified");
  }
  return { blocked: blocking.length > 0, claims: next, audit, blocking };
}

export async function createApplicationWorkspace(input: ApplicationInput): Promise<ApplicationArchive> {
  const plan = planApplication(input);
  if (plan.status !== "ready") throw new Error(plan.status === "blocked" ? `application blocked: ${plan.reason}` : "application requires PROCEED confirmation");
  const grounding = groundClaims(input.claims, input.facts);
  if (grounding.blocked) throw new Error("application claims contain blocking grounding issues");
  await initializeWorkspace(input.cwd);
  const directory = join(input.cwd, WORKSPACE_DIR, "applications", archiveSlug(`${input.company}_${input.title}`));
  await mkdir(directory, { recursive: true });
  const postingPath = join(directory, "job-posting.md");
  const posting = `# ${input.title} at ${input.company}\n\nURL: ${input.url}\n\n${normalizePostingText(input.postingText)}\n`;
  await writeFile(postingPath, posting, { encoding: "utf8", flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(postingPath, "utf8");
    if (!existing) throw new Error("immutable posting capture is empty");
  });
  await writeJsonAtomic(join(directory, "evaluation.json"), input.evaluation);
  const claimLines = grounding.claims.map((claim) => `- ${claim.text}`).join("\n");
  await writeFile(join(directory, "cv-draft.md"), `# CV draft\n\n${claimLines}\n`, "utf8");
  await writeFile(join(directory, "cover-letter-draft.md"), `# Cover letter draft\n\n${claimLines}\n`, "utf8");
  return { directory, draftOnly: true, files: ["job-posting.md", "evaluation.json", "cv-draft.md", "cover-letter-draft.md"] };
}
