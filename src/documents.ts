import { execFile as execFileCallback } from "node:child_process";
import { access, readFile, readdir, rm } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { WORKSPACE_DIR } from "./workspace.js";

const execFile = promisify(execFileCallback);
const LATEX_ENGINES = new Set(["pdflatex", "lualatex", "xelatex"]);
const GENERATED_EXTENSIONS = new Set([".aux", ".log", ".out", ".toc", ".fls", ".fdb_latexmk"]);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[], options?: { cwd?: string; timeout?: number }) => Promise<CommandResult>;

const defaultRunner: CommandRunner = async (command, args, options) => {
  const result = await execFile(command, args, { cwd: options?.cwd, timeout: options?.timeout ?? 30_000, maxBuffer: 4_000_000 });
  return { stdout: result.stdout, stderr: result.stderr };
};

function insideState(cwd: string, target: string): void {
  const root = resolve(cwd, WORKSPACE_DIR);
  const remainder = relative(root, resolve(target));
  if (remainder === ".." || remainder.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || resolve(remainder) === resolve(target)) {
    throw new Error("document path is outside workspace");
  }
}

export function validateTexSource(source: string): true {
  if (/\\(?:write18|input|include|openout|read)\b/i.test(source) || /(^|[^a-z])\.\.([/\\]|$)/.test(source)) {
    throw new Error("unsafe LaTeX command or path");
  }
  return true;
}

export interface CompileOptions {
  cwd: string;
  engine?: "pdflatex" | "lualatex" | "xelatex";
  timeoutMs?: number;
  runner?: CommandRunner;
  source?: string;
}

export interface CompileResult {
  command: string;
  args: string[];
  pdfPath: string;
  stdout: string;
  stderr: string;
}

export async function compileLatex(texPath: string, options: CompileOptions): Promise<CompileResult> {
  const engine = options.engine ?? "pdflatex";
  if (!LATEX_ENGINES.has(engine)) throw new Error("unsupported LaTeX engine");
  insideState(options.cwd, texPath);
  if (extname(texPath).toLowerCase() !== ".tex") throw new Error("LaTeX source must be a .tex file");
  if (options.source !== undefined) validateTexSource(options.source);
  else {
    try {
      validateTexSource(await readFile(texPath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const outputDirectory = dirname(resolve(texPath));
  const args = ["-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-output-directory", outputDirectory, basename(texPath)];
  const result = await (options.runner ?? defaultRunner)(engine, args, { cwd: outputDirectory, timeout: options.timeoutMs ?? 30_000 });
  return { command: engine, args, pdfPath: join(outputDirectory, `${basename(texPath, extname(texPath))}.pdf`), stdout: result.stdout, stderr: result.stderr };
}

export interface DocumentVerificationInput {
  cwd?: string;
  pdfPath: string;
  expectedPages: number;
  requiredText: string[];
  forbiddenText: string[];
  keywords: string[];
}

export interface DocumentVerificationResult {
  passed: boolean;
  pageCount: number | null;
  extractableText: string;
  missingRequiredText: string[];
  forbiddenTextFound: string[];
  missingKeywords: string[];
}

export async function verifyDocument(input: DocumentVerificationInput, runner: CommandRunner = defaultRunner): Promise<DocumentVerificationResult> {
  if (input.cwd) insideState(input.cwd, input.pdfPath);
  const info = await runner("pdfinfo", [input.pdfPath]);
  const pageMatch = info.stdout.match(/Pages:\s*(\d+)/i);
  const pageCount = pageMatch ? Number(pageMatch[1]) : null;
  const extracted = await runner("pdftotext", [input.pdfPath, "-"]);
  const text = extracted.stdout;
  const comparable = text.toLocaleLowerCase();
  const missingRequiredText = input.requiredText.filter((value) => !comparable.includes(value.toLocaleLowerCase()));
  const forbiddenTextFound = input.forbiddenText.filter((value) => comparable.includes(value.toLocaleLowerCase()));
  const missingKeywords = input.keywords.filter((value) => !comparable.includes(value.toLocaleLowerCase()));
  return {
    passed: pageCount === input.expectedPages && text.trim().length > 0 && missingRequiredText.length === 0 && forbiddenTextFound.length === 0 && missingKeywords.length === 0,
    pageCount,
    extractableText: text,
    missingRequiredText,
    forbiddenTextFound,
    missingKeywords,
  };
}

export async function cleanupDocumentArtifacts(directory: string, names?: string[]): Promise<string[]> {
  const candidates = names ?? await readdir(directory);
  const removed: string[] = [];
  for (const name of candidates) {
    if (basename(name) !== name || !GENERATED_EXTENSIONS.has(extname(name).toLowerCase())) continue;
    await rm(join(directory, name), { force: true });
    removed.push(name);
  }
  return removed;
}
