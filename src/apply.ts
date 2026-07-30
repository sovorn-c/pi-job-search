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
