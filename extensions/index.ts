import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkProfileConsistency, executeReset, previewReset, type ResetMode } from "../src/profile.js";
import { createHttpClient, createPortalRegistry, type PortalName } from "../src/portals.js";
import { assessPortalHealth, mergeSeenJobs, orchestrateScrape, readSeenState, writeSeenState } from "../src/scrape.js";
import { initializeWorkspace } from "../src/workspace.js";

const resetMode = Type.Union([Type.Literal("profile"), Type.Literal("documents"), Type.Literal("all")]);
const portalNames = Type.Optional(Type.Array(Type.String()));

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: {} };
}

export default function register(pi: Pick<ExtensionAPI, "registerTool">) {
  pi.registerTool({
    name: "job_search_capabilities",
    label: "Job Search Capabilities",
    description: "Report the installed Pi job-search package foundation.",
    parameters: Type.Object({}),
    async execute() {
      return textResult({ package: "@sovorn/pi-job-search", version: "0.1.0" });
    },
  });

  pi.registerTool({
    name: "job_search_initialize_workspace",
    label: "Initialize Job Search Workspace",
    description: "Create the ignored local job-search state directories.",
    parameters: Type.Object({}),
    async execute() {
      return textResult(await initializeWorkspace());
    },
  });

  pi.registerTool({
    name: "job_search_profile_consistency",
    label: "Check Profile Consistency",
    description: "Report missing or inferred local profile facts without writing data.",
    parameters: Type.Object({}),
    async execute() {
      return textResult(await checkProfileConsistency(process.cwd()));
    },
  });

  pi.registerTool({
    name: "job_search_profile_reset",
    label: "Reset Job Search Data",
    description: "Preview or exact-confirm a bounded local profile reset.",
    parameters: Type.Object({ mode: resetMode, confirmation: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params: { mode: ResetMode; confirmation?: string }) {
      if (params.confirmation !== "RESET") return textResult(await previewReset(process.cwd(), params.mode));
      return textResult(await executeReset(process.cwd(), params.mode, params.confirmation));
    },
  });

  pi.registerTool({
    name: "job_search_scrape",
    label: "Scrape Job Portals",
    description: "Search enabled public portals, deduplicate results, and persist seen-job state.",
    parameters: Type.Object({ query: Type.String(), location: Type.Optional(Type.String()), portals: portalNames }),
    async execute(_toolCallId, params: { query: string; location?: string; portals?: string[] }) {
      const registry = createPortalRegistry(createHttpClient());
      const adapters = (params.portals?.length ? params.portals : [...registry.keys()]).map((name) => registry.get(name as PortalName));
      const result = await orchestrateScrape(adapters, { query: params.query, location: params.location });
      const merged = mergeSeenJobs(result.jobs, await readSeenState(process.cwd()));
      await writeSeenState(process.cwd(), merged.state);
      return textResult({ jobs: merged.newJobs, failures: result.failures, warnings: result.warnings });
    },
  });

  pi.registerTool({
    name: "job_search_portal_health",
    label: "Check Portal Health",
    description: "Run bounded sentinel probes against enabled public portals.",
    parameters: Type.Object({ query: Type.String(), portals: portalNames }),
    async execute(_toolCallId, params: { query: string; portals?: string[] }) {
      const registry = createPortalRegistry(createHttpClient());
      const names = params.portals?.length ? params.portals : [...registry.keys()];
      const health = await Promise.all(names.map((name) => {
        const adapter = registry.get(name as PortalName);
        return adapter ? assessPortalHealth(adapter, { query: params.query }) : null;
      }));
      return textResult(health.filter(Boolean));
    },
  });
}
