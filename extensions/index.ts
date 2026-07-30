import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function register(pi: Pick<ExtensionAPI, "registerTool">) {
  pi.registerTool({
    name: "job_search_capabilities",
    label: "Job Search Capabilities",
    description: "Report the installed Pi job-search package foundation.",
    parameters: Type.Object({}),
    async execute() {
      return {
        content: [{ type: "text", text: JSON.stringify({ package: "@sovorn/pi-job-search", version: "0.1.0" }) }],
        details: {},
      };
    },
  });
}
