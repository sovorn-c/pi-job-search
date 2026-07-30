import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { enablePortal, listPortalInvestigations } from "./portal-generator.js";
import { writeJsonAtomic, WORKSPACE_DIR } from "./workspace.js";

export interface PortalFixture {
  search: unknown;
  detail: unknown;
}

export interface FixtureVerification {
  passed: boolean;
  errors: string[];
}

export interface ManualSmokeEvidence {
  source: string;
  result: "pass" | "fail";
  timestamp?: string;
  notes?: string;
}

export interface PortalScaffoldInput {
  name: string;
  fixture: PortalFixture;
  fixtureVerified?: boolean;
  manualSmokeVerified?: boolean;
  manualEvidence?: ManualSmokeEvidence;
}

export interface PortalScaffoldResult {
  name: string;
  directory: string;
  adapterPath: string;
  fixturePath: string;
  enabled: boolean;
  fixtureVerified: boolean;
  manualSmokeVerified: boolean;
}

function isJob(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.title === "string" && typeof record.company === "string" && typeof record.url === "string";
}

export function verifyPortalFixture(fixture: PortalFixture): FixtureVerification {
  const errors: string[] = [];
  if (!Array.isArray(fixture.search)) errors.push("fixture.search must be an array");
  else if (!fixture.search.some(isJob)) errors.push("fixture.search must contain a normalized job");
  if (!isJob(fixture.detail)) errors.push("fixture.detail must be a normalized job");
  return { passed: errors.length === 0, errors };
}

function adapterSource(name: string): string {
  return `import type { PortalAdapter, PortalSearchResult, SearchQuery } from "../../../src/portals.js";\n\nexport const portalName = ${JSON.stringify(name)};\n\nexport function createAdapter(): PortalAdapter {\n  return {\n    name: portalName,\n    async search(_query: SearchQuery): Promise<PortalSearchResult> {\n      throw new Error("Generated adapter requires maintainer implementation and fixture verification");\n    },\n    async detail(_idOrUrl: string): Promise<import("../../../src/portals.js").NormalizedJob> {\n      throw new Error("Generated adapter requires maintainer implementation and live verification");\n    },\n  };\n}\n`;
}

export async function scaffoldPortalAdapter(cwd: string, input: PortalScaffoldInput): Promise<PortalScaffoldResult> {
  const investigations = await listPortalInvestigations(cwd);
  const investigation = investigations.find((item) => item.name === input.name);
  if (!investigation) throw new Error("investigate the portal before scaffolding");
  if (investigation.decision === "refuse") throw new Error(investigation.reason);
  const verification = verifyPortalFixture(input.fixture);
  if (!verification.passed) throw new Error(`invalid portal fixture: ${verification.errors.join(", ")}`);
  const directory = join(cwd, WORKSPACE_DIR, "portals", input.name);
  await mkdir(directory, { recursive: true });
  const fixturePath = join(directory, "fixture.json");
  const adapterPath = join(directory, "adapter.ts");
  await writeJsonAtomic(fixturePath, input.fixture);
  await writeJsonAtomic(join(directory, "smoke-evidence.json"), input.manualEvidence ?? { source: investigation.url, result: "not-run" });
  await writeJsonAtomic(join(directory, "manifest.json"), { name: input.name, source: investigation.url, warning: investigation.warning, fixtureContract: "verified", enabled: false });
  await writeFile(adapterPath, adapterSource(input.name), { encoding: "utf8", flag: "wx" });
  const manuallyVerified = input.manualSmokeVerified === true && input.manualEvidence?.result === "pass";
  let enabled = false;
  if (input.fixtureVerified === true && manuallyVerified) {
    await enablePortal(cwd, input.name, true, true);
    await writeJsonAtomic(join(directory, "manifest.json"), { name: input.name, source: investigation.url, warning: investigation.warning, fixtureContract: "verified", enabled: true });
    enabled = true;
  }
  return { name: input.name, directory, adapterPath, fixturePath, enabled, fixtureVerified: true, manualSmokeVerified: manuallyVerified };
}

export async function readPortalFixture(path: string): Promise<PortalFixture> {
  return JSON.parse(await readFile(path, "utf8")) as PortalFixture;
}

export const createPortalScaffold = scaffoldPortalAdapter;
