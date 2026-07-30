import { extractRequirements, type Requirement, type RequirementKind } from "./apply.js";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveStatePath } from "./profile.js";

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

export interface RoleGapInput {
  applicationKey: string;
  role: string;
  importance?: number;
  gaps: Array<Pick<SkillGap, "text" | "priority">>;
}

export interface AggregateGap {
  text: string;
  normalized: string;
  frequency: number;
  weight: number;
  priority: 1 | 3;
  roles: string[];
}

export interface AggregateReport {
  gaps: AggregateGap[];
  learningPlan: AggregateGap[];
  generatedAt: string;
}

export interface UpskillDiff {
  added: string[];
  resolved: string[];
  persisting: string[];
  previousDate: string;
}

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

export function aggregateGaps(roles: RoleGapInput[], generatedAt = new Date().toISOString().slice(0, 10)): AggregateReport {
  const grouped = new Map<string, { text: string; frequency: number; importance: number; priority: 1 | 3; roles: string[] }>();
  for (const role of roles) {
    const seen = new Set<string>();
    for (const gap of role.gaps) {
      const normalized = normalizeSkill(gap.text);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      const current = grouped.get(normalized) ?? { text: gap.text, frequency: 0, importance: 0, priority: 1, roles: [] };
      current.frequency += 1;
      current.importance += Math.max(0, role.importance ?? 1);
      current.priority = Math.max(current.priority, gap.priority) as 1 | 3;
      if (!current.roles.includes(role.role)) current.roles.push(role.role);
      grouped.set(normalized, current);
    }
  }
  const gaps = [...grouped.entries()].map(([normalized, value]) => ({
    ...value,
    normalized,
    weight: value.frequency * value.importance * value.priority,
  })).sort((left, right) => right.weight - left.weight || left.normalized.localeCompare(right.normalized));
  return { gaps, learningPlan: [...gaps], generatedAt };
}

export function diffReports(previous: AggregateReport, current: AggregateReport): UpskillDiff {
  const oldKeys = new Set(previous.gaps.map((gap) => gap.normalized));
  const newKeys = new Set(current.gaps.map((gap) => gap.normalized));
  return {
    added: [...newKeys].filter((key) => !oldKeys.has(key)).sort(),
    resolved: [...oldKeys].filter((key) => !newKeys.has(key)).sort(),
    persisting: [...newKeys].filter((key) => oldKeys.has(key)).sort(),
    previousDate: previous.generatedAt,
  };
}

export function aggregateUpskill(roles: RoleGapInput[], previous?: AggregateReport, generatedAt?: string): AggregateReport & { diff?: UpskillDiff } {
  const report = aggregateGaps(roles, generatedAt);
  return previous ? { ...report, diff: diffReports(previous, report) } : report;
}

export function serializeUpskillReport(report: AggregateReport): string {
  return `# Upskill report — ${report.generatedAt}\n\n${report.gaps.map((gap, index) => `${index + 1}. **${gap.text}** — weight ${gap.weight}; ${gap.frequency} role(s): ${gap.roles.join(", ")}`).join("\n")}\n\n<!-- report-data\n${JSON.stringify(report)}\nreport-data -->\n`;
}

export async function writeUpskillReport(cwd: string, report: AggregateReport, date = report.generatedAt): Promise<string> {
  const directory = resolveStatePath(cwd, "upskill");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `report-${date}.md`);
  await writeFile(path, serializeUpskillReport(report), "utf8");
  return path;
}

export async function readLatestUpskillReport(cwd: string): Promise<AggregateReport | undefined> {
  let names: string[];
  try { names = (await readdir(resolveStatePath(cwd, "upskill"))).filter((name) => /^report-.*\.md$/.test(name)).sort(); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  if (!names.length) return undefined;
  const text = await readFile(join(resolveStatePath(cwd, "upskill"), names.at(-1)!), "utf8");
  const match = text.match(/<!-- report-data\n([\s\S]*?)\nreport-data -->/);
  return match ? JSON.parse(match[1]) as AggregateReport : undefined;
}
