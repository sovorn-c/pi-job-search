import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkProfileConsistency, executeReset, previewReset, type ResetMode } from "../src/profile.js";
import { initializeWorkspace } from "../src/workspace.js";

const resetMode = Type.Union([Type.Literal("profile"), Type.Literal("documents"), Type.Literal("all")]);

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
    parameters: Type.Object({
      mode: resetMode,
      confirmation: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params: { mode: ResetMode; confirmation?: string }) {
      if (params.confirmation !== "RESET") return textResult(await previewReset(process.cwd(), params.mode));
      return textResult(await executeReset(process.cwd(), params.mode, params.confirmation));
    },
  });
}
