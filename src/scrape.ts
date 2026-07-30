import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { initializeWorkspace, writeJsonAtomic, WORKSPACE_DIR } from "./workspace.js";
import type { NormalizedJob, PortalAdapter, PortalError, PortalSearchResult, SearchQuery } from "./portals.js";

export type { NormalizedJob, PortalAdapter, SearchQuery } from "./portals.js";

export interface ScrapeFailure {
  portal: string;
  error: string;
  code?: string;
}

export interface ScrapeResult {
  jobs: NormalizedJob[];
  failures: ScrapeFailure[];
  warnings: string[];
}

export interface ScrapeOptions {
  concurrency?: number;
  fallback?: (query: SearchQuery) => Promise<NormalizedJob[]>;
}

export async function orchestrateScrape(
  adapters: Array<PortalAdapter | undefined>,
  query: SearchQuery,
  options: ScrapeOptions = {},
): Promise<ScrapeResult> {
  const usable = adapters.filter((adapter): adapter is PortalAdapter => Boolean(adapter));
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const jobs: NormalizedJob[] = [];
  const failures: ScrapeFailure[] = [];
  const warnings: string[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < usable.length) {
      const index = cursor++;
      const adapter = usable[index];
      try {
        const result = await adapter.search(query);
        jobs.push(...result.jobs);
        warnings.push(...result.warnings);
      } catch (error) {
        const typed = error as Partial<PortalError>;
        failures.push({ portal: adapter.name, error: error instanceof Error ? error.message : "portal failed", code: typed.code });
        if (options.fallback) {
          try {
            jobs.push(...await options.fallback(query));
          } catch (fallbackError) {
            failures.push({ portal: `${adapter.name}:fallback`, error: fallbackError instanceof Error ? fallbackError.message : "fallback failed" });
          }
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, usable.length) }, () => worker()));
  return { jobs, failures, warnings };
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function identityValue(job: NormalizedJob): string {
  const title = normalized(job.title);
  const company = normalized(job.company);
  const location = normalized(job.location);
  if (title || company) return `${title}|${company}|${location}`;
  return normalized(job.url);
}

export function stableJobId(job: NormalizedJob): string {
  return createHash("sha256").update(identityValue(job)).digest("hex").slice(0, 24);
}

export interface SeenJob {
  job: NormalizedJob;
  sources: NormalizedJob[];
}

export interface SeenState {
  seen: Record<string, SeenJob | NormalizedJob>;
  applied: string[];
}

export interface MergedJob extends NormalizedJob {
  sources: NormalizedJob[];
  locations: string[];
}

function asSeenJob(value: SeenJob | NormalizedJob): SeenJob {
  return "sources" in value ? value : { job: value, sources: [value] };
}

export function consolidateMassPosts(jobs: NormalizedJob[]): MergedJob[] {
  const groups = new Map<string, MergedJob>();
  for (const job of jobs) {
    const key = `${normalized(job.title)}|${normalized(job.company)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...job, sources: [job], locations: job.location ? [job.location] : [] });
      continue;
    }
    existing.sources.push(job);
    if (job.location && !existing.locations.includes(job.location)) existing.locations.push(job.location);
  }
  return [...groups.values()];
}

export function mergeSeenJobs(jobs: NormalizedJob[], state: SeenState): { newJobs: MergedJob[]; state: SeenState } {
  const grouped = new Map<string, NormalizedJob[]>();
  for (const job of jobs) {
    const id = stableJobId(job);
    grouped.set(id, [...(grouped.get(id) ?? []), job]);
  }
  const applied = new Set(state.applied);
  const nextSeen = { ...state.seen };
  const newJobs: MergedJob[] = [];
  for (const [id, group] of grouped) {
    const existing = nextSeen[id] ? asSeenJob(nextSeen[id]) : undefined;
    const allSources = [...(existing?.sources ?? []), ...group];
    const consolidated = consolidateMassPosts(allSources)[0];
    nextSeen[id] = { job: consolidated, sources: allSources };
    if (!existing && !applied.has(id)) newJobs.push(consolidated);
  }
  return { newJobs, state: { seen: nextSeen, applied: [...applied] } };
}

function seenStatePath(cwd: string): string {
  return join(resolve(cwd), WORKSPACE_DIR, "search", "seen-jobs.json");
}

export async function readSeenState(cwd: string): Promise<SeenState> {
  try {
    return JSON.parse(await readFile(seenStatePath(cwd), "utf8")) as SeenState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { seen: {}, applied: [] };
    throw error;
  }
}

export async function writeSeenState(cwd: string, state: SeenState): Promise<void> {
  await initializeWorkspace(cwd);
  await writeJsonAtomic(seenStatePath(cwd), state);
}

export type HealthStatus = "healthy" | "degraded" | "broken" | "inconclusive";

export interface PortalHealth {
  portal: string;
  status: HealthStatus;
  probes: number;
  detail: string;
}

export async function assessPortalHealth(
  adapter: PortalAdapter,
  query: SearchQuery,
  options: { maxProbes?: number } = {},
): Promise<PortalHealth> {
  const probes = Math.min(1, options.maxProbes ?? 1);
  try {
    const result: PortalSearchResult = await adapter.search(query);
    if (result.jobs.length > 0) return { portal: adapter.name, status: "healthy", probes, detail: "sentinel returned usable jobs" };
    return { portal: adapter.name, status: "degraded", probes, detail: "sentinel returned zero jobs" };
  } catch (error) {
    const code = (error as Partial<PortalError>).code;
    const status: HealthStatus = code === "rate_limit" || code === "timeout" ? "inconclusive" : "broken";
    return { portal: adapter.name, status, probes, detail: error instanceof Error ? error.message : "health probe failed" };
  }
}
