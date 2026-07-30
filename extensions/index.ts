import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "typebox";
import { checkProfileConsistency, executeReset, previewReset, type ResetMode } from "../src/profile.js";
import { createApplicationWorkspace, evaluatePosting, extractRequirements, type ApprovedFact, type DraftClaim } from "../src/apply.js";
import { recordOutcome } from "../src/outcome.js";
import { draftFollowup } from "../src/followup.js";
import { buildInterviewPack, saveInterviewPack, type InterviewStage } from "../src/interview.js";
import { verifyDocument } from "../src/documents.js";
import { rankJobs, mergeRankState, type RankInput, type RankState } from "../src/rank.js";
import { createHttpClient, createPortalRegistry, type PortalName } from "../src/portals.js";
import { assessPortalHealth, mergeSeenJobs, orchestrateScrape, readSeenState, writeSeenState } from "../src/scrape.js";
import { initializeWorkspace, writeJsonAtomic, WORKSPACE_DIR } from "../src/workspace.js";

const resetMode = Type.Union([Type.Literal("profile"), Type.Literal("documents"), Type.Literal("all")]);
const portalNames = Type.Optional(Type.Array(Type.String()));
const rankInput = Type.Object({
  source: Type.String(), id: Type.String(), title: Type.Union([Type.String(), Type.Null()]), company: Type.Union([Type.String(), Type.Null()]),
  location: Type.Union([Type.String(), Type.Null()]), datePosted: Type.Union([Type.String(), Type.Null()]), url: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]), employmentType: Type.Union([Type.String(), Type.Null()]),
  scores: Type.Object({ technical: Type.Number(), experience: Type.Number(), behavioral: Type.Number(), career: Type.Number() }),
  workRights: Type.Union([Type.Literal("PASS"), Type.Literal("FAIL"), Type.Literal("UNKNOWN")]),
  locationGate: Type.Union([Type.Literal("PASS"), Type.Literal("FAIL"), Type.Literal("FLAG"), Type.Literal("UNKNOWN")]),
  deadline: Type.Union([Type.String(), Type.Null()]), strengths: Type.Array(Type.String()), gaps: Type.Array(Type.String()),
});
const claimInput = Type.Object({ id: Type.String(), key: Type.String(), value: Type.Unknown(), text: Type.String(), factIds: Type.Array(Type.String()) });
const factInput = Type.Object({ id: Type.String(), key: Type.String(), value: Type.Unknown(), source: Type.Union([Type.Literal("approved-profile"), Type.Literal("base-cv"), Type.Literal("approved-workspace")]), provenance: Type.String() });
const outcomeStatus = Type.Union([Type.Literal("acknowledged"), Type.Literal("interview"), Type.Literal("offer"), Type.Literal("hired"), Type.Literal("rejected"), Type.Literal("no-response"), Type.Literal("follow-up"), Type.Literal("offer-declined"), Type.Literal("withdrawn")]);
const interviewStage = Type.Union([Type.Literal("screening"), Type.Literal("technical"), Type.Literal("behavioral"), Type.Literal("onsite"), Type.Literal("final")]);

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

  pi.registerTool({
    name: "job_search_rank",
    label: "Rank Jobs",
    description: "Apply deterministic gates and weighted fit arithmetic to model-scored postings, preserving additive rank state.",
    parameters: Type.Object({ jobs: Type.Array(rankInput), date: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params: { jobs: Array<Record<string, unknown>>; date?: string }) {
      const inputs = params.jobs.map((item) => ({
        job: { source: item.source, id: item.id, title: item.title, company: item.company, location: item.location, datePosted: item.datePosted, url: item.url, description: item.description, employmentType: item.employmentType },
        scores: item.scores,
        workRights: item.workRights,
        location: item.locationGate,
        deadline: item.deadline,
        strengths: item.strengths,
        gaps: item.gaps,
      })) as unknown as RankInput[];
      const result = rankJobs(inputs, params.date ?? new Date().toISOString().slice(0, 10));
      const path = join(process.cwd(), WORKSPACE_DIR, "search", "rank-state.json");
      let state: RankState = {};
      try { state = JSON.parse(await readFile(path, "utf8")) as RankState; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const updates = [
        ...result.ranked.map((job) => ({ id: job.id, score: job.score, verdict: job.verdict, rankDate: job.rankDate, status: "ranked" as const })),
        ...result.excluded.map((job) => ({ id: job.id, rankDate: params.date, status: job.status === "expired" ? "expired" as const : "excluded" as const })),
      ];
      await initializeWorkspace(process.cwd());
      await writeJsonAtomic(path, mergeRankState(state, updates));
      return textResult(result);
    },
  });

  pi.registerTool({
    name: "job_search_apply",
    label: "Prepare Application Draft",
    description: "Evaluate one untrusted posting and create grounded draft-only artifacts only after explicit PROCEED confirmation.",
    parameters: Type.Object({
      company: Type.String(), title: Type.String(), url: Type.String(), postingText: Type.String(),
      workRights: Type.Union([Type.Literal("PASS"), Type.Literal("FAIL"), Type.Literal("UNKNOWN")]),
      location: Type.Union([Type.Literal("PASS"), Type.Literal("FAIL"), Type.Literal("FLAG"), Type.Literal("UNKNOWN")]),
      candidateSkills: Type.Array(Type.String()), proceed: Type.Optional(Type.Boolean()),
      claims: Type.Optional(Type.Array(claimInput)), facts: Type.Optional(Type.Array(factInput)),
    }),
    async execute(_toolCallId, params: { company: string; title: string; url: string; postingText: string; workRights: "PASS" | "FAIL" | "UNKNOWN"; location: "PASS" | "FAIL" | "FLAG" | "UNKNOWN"; candidateSkills: string[]; proceed?: boolean; claims?: DraftClaim[]; facts?: ApprovedFact[] }) {
      const evaluation = evaluatePosting({ postingText: params.postingText, workRights: params.workRights, location: params.location, requirements: extractRequirements(params.postingText), candidateSkills: params.candidateSkills });
      if (!params.proceed) return textResult({ evaluation, confirmation: "PROCEED" });
      const archive = await createApplicationWorkspace({ cwd: process.cwd(), company: params.company, title: params.title, url: params.url, postingText: params.postingText, evaluation, claims: params.claims ?? [], facts: params.facts ?? [], confirmation: "PROCEED" });
      return textResult({ evaluation, archive, draftOnly: true });
    },
  });

  pi.registerTool({
    name: "job_search_document_verify",
    label: "Verify Application Document",
    description: "Check PDF page count, extractable text, forbidden text, and ATS keywords.",
    parameters: Type.Object({ pdfPath: Type.String(), expectedPages: Type.Number(), requiredText: Type.Array(Type.String()), forbiddenText: Type.Array(Type.String()), keywords: Type.Array(Type.String()) }),
    async execute(_toolCallId, params: { pdfPath: string; expectedPages: number; requiredText: string[]; forbiddenText: string[]; keywords: string[] }) {
      return textResult(await verifyDocument({ ...params, cwd: process.cwd() }));
    },
  });

  pi.registerTool({
    name: "job_search_outcome",
    label: "Record Application Outcome",
    description: "Append an explicit outcome event and update the local tracker without sending or inferring a decision.",
    parameters: Type.Object({ applicationKey: Type.String(), date: Type.String(), stage: Type.String(), status: outcomeStatus, decision: Type.String(), evidence: Type.String(), notes: Type.String() }),
    async execute(_toolCallId, params: { applicationKey: string; date: string; stage: string; status: "acknowledged" | "interview" | "offer" | "hired" | "rejected" | "no-response" | "follow-up" | "offer-declined" | "withdrawn"; decision: string; evidence: string; notes: string }) {
      return textResult(await recordOutcome(process.cwd(), params));
    },
  });

  pi.registerTool({
    name: "job_search_followup",
    label: "Draft Application Follow-up",
    description: "Create a bounded thank-you or follow-up draft from approved facts; never sends it and caps messages at two.",
    parameters: Type.Object({ applicationKey: Type.String(), company: Type.String(), role: Type.String(), date: Type.String(), kind: Type.Union([Type.Literal("thank-you"), Type.Literal("follow-up")]), facts: Type.Array(Type.String()), requestedClaims: Type.Array(Type.String()), existingCount: Type.Number() }),
    async execute(_toolCallId, params: { applicationKey: string; company: string; role: string; date: string; kind: "thank-you" | "follow-up"; facts: string[]; requestedClaims: string[]; existingCount: number }) {
      return textResult(await draftFollowup({ cwd: process.cwd(), ...params }));
    },
  });

  pi.registerTool({
    name: "job_search_interview",
    label: "Prepare Interview Pack",
    description: "Build a stage-specific, archive/profile-grounded interview pack and mock protocol without external scheduling or contact scraping.",
    parameters: Type.Object({ applicationKey: Type.String(), company: Type.String(), role: Type.String(), stage: interviewStage, postingText: Type.String(), submittedMaterials: Type.Array(Type.String()), approvedFacts: Type.Array(Type.String()), feedback: Type.Array(Type.String()), research: Type.Optional(Type.Array(Type.Object({ fact: Type.String(), source: Type.String(), date: Type.String() }))) }),
    async execute(_toolCallId, params: { applicationKey: string; company: string; role: string; stage: InterviewStage; postingText: string; submittedMaterials: string[]; approvedFacts: string[]; feedback: string[]; research?: Array<{ fact: string; source: string; date: string }> }) {
      const pack = buildInterviewPack(params);
      return textResult({ pack, path: await saveInterviewPack(process.cwd(), pack) });
    },
  });
}
