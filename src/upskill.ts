import { extractRequirements, type Requirement, type RequirementKind } from "./apply.js";

export interface VerifiedResource {
  title: string;
  url: string;
  source: string;
  verified: true;
}

export interface SkillGap {
  id: string;
  text: string;
  kind: RequirementKind;
  priority: 1 | 3;
  source?: string;
  reason: "required-gap" | "preferred-gap";
}

export interface ResourceLookupResult {
  resourceStatus: "available" | "unavailable";
  resources: VerifiedResource[];
}

export interface SingleRoleInput {
  postingText: string;
  approvedSkills: string[];
  source?: string;
}

export interface SingleRoleReport extends ResourceLookupResult {
  source?: string;
  requirements: Requirement[];
  gaps: SkillGap[];
  hardGaps: SkillGap[];
  preferredGaps: SkillGap[];
  withResources(lookup: ResourceLookup): Promise<SingleRoleReport>;
}

export type ResourceLookup = (gaps: SkillGap[]) => Promise<VerifiedResource[]>;

export function normalizeSkill(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").replace(/\s+/g, " ").trim();
}

function covered(requirement: string, skills: string[]): boolean {
  const target = normalizeSkill(requirement);
  return skills.some((skill) => {
    const value = normalizeSkill(skill);
    return value === target || value.includes(target) || target.includes(value);
  });
}

function makeGaps(requirements: Requirement[], approvedSkills: string[], source?: string): SkillGap[] {
  const skills = approvedSkills.map(normalizeSkill);
  return requirements.filter((requirement) => !covered(requirement.text, skills)).map((requirement) => ({
    id: `gap-${normalizeSkill(requirement.text).replace(/ /g, "-")}`,
    text: requirement.text,
    kind: requirement.kind,
    priority: requirement.kind === "required" ? 3 as const : 1 as const,
    source,
    reason: requirement.kind === "required" ? "required-gap" as const : "preferred-gap" as const,
  }));
}

function validResource(resource: VerifiedResource): boolean {
  return resource.verified === true && typeof resource.title === "string" && resource.title.length > 0 &&
    typeof resource.source === "string" && resource.source.length > 0 && /^https?:\/\//i.test(resource.url);
}

export function analyzeSingleRole(input: SingleRoleInput): SingleRoleReport {
  const requirements = extractRequirements(input.postingText);
  const gaps = makeGaps(requirements, input.approvedSkills, input.source);
  const report: SingleRoleReport = {
    source: input.source,
    requirements,
    gaps,
    hardGaps: gaps.filter((gap) => gap.kind === "required"),
    preferredGaps: gaps.filter((gap) => gap.kind === "preferred"),
    resourceStatus: "unavailable",
    resources: [],
    withResources: async (lookup) => {
      try {
        const resources = (await lookup(gaps)).filter(validResource);
        return { ...report, resourceStatus: resources.length ? "available" : "unavailable", resources };
      } catch {
        return { ...report, resourceStatus: "unavailable", resources: [] };
      }
    },
  };
  return report;
}
