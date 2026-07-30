import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic, WORKSPACE_DIR } from "./workspace.js";

export type PortalPolicySignal = "allowed" | "restricted" | "unknown";
export type PortalDecision = "allow" | "warn" | "refuse";

export interface PortalInvestigationInput {
  name: string;
  url: string;
  authRequired: boolean;
  robots: PortalPolicySignal;
  terms: PortalPolicySignal;
  endpoints?: string[];
  fields?: string[];
  overwrite?: boolean;
  confirmation?: "REPLACE";
}

export interface PortalPolicyResult {
  decision: PortalDecision;
  reason: string;
  warning: string;
}

export interface PortalInvestigation extends PortalInvestigationInput {
  schemaVersion: 1;
  host: string;
  decision: PortalDecision;
  reason: string;
  warning: string;
  enabled: boolean;
  fixtureVerified: boolean;
  manualSmokeVerified: boolean;
  investigatedAt: string;
}

const REGISTRY = "portals/registry.json";
function registryPath(cwd: string): string { return join(cwd, WORKSPACE_DIR, REGISTRY); }
function validName(name: string): boolean { return /^[a-z][a-z0-9-]{0,63}$/.test(name); }

function validateUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("portal source URL must be a valid https URL"); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("portal source URL must be public http(s) without credentials");
  return url;
}

export function portalAccessDecision(input: Pick<PortalInvestigationInput, "authRequired" | "robots" | "terms">): PortalPolicyResult {
  if (input.authRequired) return { decision: "refuse", reason: "portal requires authentication; use an official API or public export instead", warning: "" };
  if (input.robots !== "allowed" || input.terms !== "allowed") return { decision: "warn", reason: "public portal has robots or terms restrictions that require human review", warning: "Personal use only. Respect robots.txt, terms, rate limits, and stop if access controls appear." };
  return { decision: "allow", reason: "public portal has no recorded access restriction", warning: "" };
}

async function readRegistry(cwd: string): Promise<PortalInvestigation[]> {
  try {
    const value = JSON.parse(await readFile(registryPath(cwd), "utf8")) as { portals?: PortalInvestigation[] };
    return Array.isArray(value.portals) ? value.portals : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function listPortalInvestigations(cwd = process.cwd()): Promise<PortalInvestigation[]> { return readRegistry(cwd); }

export async function investigatePortal(cwd: string, input: PortalInvestigationInput): Promise<PortalInvestigation> {
  if (!validName(input.name)) throw new Error("invalid portal name");
  const url = validateUrl(input.url);
  const records = await readRegistry(cwd);
  if (records.some((record) => record.name === input.name) && (!input.overwrite || input.confirmation !== "REPLACE")) throw new Error("portal investigation exists; confirmation REPLACE is required to overwrite");
  const policy = portalAccessDecision(input);
  const result: PortalInvestigation = { ...input, schemaVersion: 1, url: url.href, host: url.host, decision: policy.decision, reason: policy.reason, warning: policy.warning, enabled: false, fixtureVerified: false, manualSmokeVerified: false, investigatedAt: new Date().toISOString() };
  await writeJsonAtomic(registryPath(cwd), { schemaVersion: 1, portals: [...records.filter((record) => record.name !== input.name), result] });
  return result;
}

export async function enablePortal(cwd: string, name: string, fixtureVerified: boolean, manualSmokeVerified: boolean): Promise<PortalInvestigation> {
  const records = await readRegistry(cwd);
  const record = records.find((item) => item.name === name);
  if (!record) throw new Error(`unknown portal: ${name}`);
  if (record.decision === "refuse") throw new Error("auth-walled portal cannot be enabled");
  if (!fixtureVerified || !manualSmokeVerified) throw new Error("fixture verification and explicit manual smoke are required before enabling");
  const enabled = { ...record, fixtureVerified: true, manualSmokeVerified: true, enabled: true };
  await writeJsonAtomic(registryPath(cwd), { schemaVersion: 1, portals: records.map((item) => item.name === name ? enabled : item) });
  return enabled;
}

export const recordPortalInvestigation = investigatePortal;
