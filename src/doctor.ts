const SENSITIVE_ENVIRONMENT_KEYS = [
  "PI_JOB_SEARCH_TOKEN",
  "GMAIL_TOKEN",
  "GMAIL_ACCESS_TOKEN",
  "NOTION_TOKEN",
] as const;

function supportedNodeVersion(version: string): boolean {
  const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major >= 20;
}

export function getDoctorReport(env: NodeJS.ProcessEnv = process.env) {
  const nodeVersion = env.NODE_VERSION ?? process.version;
  const environment = Object.fromEntries(
    SENSITIVE_ENVIRONMENT_KEYS.map((key) => [
      key,
      { configured: Boolean(env[key]), value: env[key] ? "[redacted]" : null },
    ]),
  );

  return {
    node: {
      version: nodeVersion,
      supported: supportedNodeVersion(nodeVersion),
    },
    environment,
  };
}
