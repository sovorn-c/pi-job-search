import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { extname, join } from "node:path";
import type { CommandRunner } from "./documents.js";
import { validateTexSource } from "./documents.js";
import { writeJsonAtomic, WORKSPACE_DIR } from "./workspace.js";

export type TemplateName = "cv" | "cover-letter" | "form-answers" | string;

interface BuiltInTemplate {
  extension: string;
  file: string;
}

const BUILT_INS: Record<string, BuiltInTemplate> = {
  cv: { extension: "tex", file: "cv.tex" },
  "cover-letter": { extension: "tex", file: "cover-letter.tex" },
  "form-answers": { extension: "json", file: "form-answers.json" },
};

function validName(name: string): boolean {
  return /^[a-z][a-z0-9-]{0,63}$/.test(name);
}

function customPath(cwd: string, name: string): string {
  if (!validName(name)) throw new Error("invalid template name");
  return join(cwd, WORKSPACE_DIR, "templates", `${name}.template`);
}

const REGISTRY = "templates/registry.json";
const ACTIVE = "templates/active.json";
const SAFE_COMPILERS = new Set(["pdflatex", "lualatex", "xelatex", "pandoc"]);
const execFile = promisify(execFileCallback);
const defaultRunner: CommandRunner = async (command, args, options) => {
  const result = await execFile(command, args, { cwd: options?.cwd, timeout: options?.timeout ?? 10_000, maxBuffer: 2_000_000 });
  return { stdout: result.stdout, stderr: result.stderr };
};

export interface TemplateRecord {
  name: string;
  type: "tex" | "json" | "text" | string;
  extension: string;
  path: string;
  compileCommand?: string;
  fonts: string[];
  placeholders: string[];
  pageRules: string[];
  active: boolean;
  default: boolean;
}

export interface TemplateRegistrationInput {
  name: string;
  filePath?: string;
  content?: string;
  type?: string;
  extension?: string;
  compileCommand?: string;
  fonts?: string[];
  placeholders?: string[];
  pageRules?: string[];
}

export interface TemplateCompileOptions {
  runner?: CommandRunner;
  timeoutMs?: number;
}

export interface ResolvedTemplate {
  name: string;
  extension: string;
  path: string;
  content: string;
  builtIn: boolean;
}

function registryPath(cwd: string): string { return join(cwd, WORKSPACE_DIR, REGISTRY); }
function activePath(cwd: string): string { return join(cwd, WORKSPACE_DIR, ACTIVE); }

async function readRegistry(cwd: string): Promise<TemplateRecord[]> {
  try {
    const value = JSON.parse(await readFile(registryPath(cwd), "utf8")) as { templates?: TemplateRecord[] };
    return Array.isArray(value.templates) ? value.templates : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function tokenizeCommand(command: string): string[] {
  if (!command.trim() || /(?:;|&&|\|\||[|<>`]|\$\(|\n|\r)/.test(command)) throw new Error("unsafe compile command");
  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = pattern.exec(command))) {
    if (command.slice(consumed, match.index).trim()) throw new Error("unsafe compile command");
    tokens.push(match[1] ?? match[2] ?? match[3]);
    consumed = pattern.lastIndex;
  }
  if (command.slice(consumed).trim()) throw new Error("unsafe compile command");
  return tokens;
}

export function sanitizeCompileCommand(command: string): string[] {
  const tokens = tokenizeCommand(command);
  const executable = tokens[0];
  if (!executable || !SAFE_COMPILERS.has(executable) || tokens.some((token) => /(^|[\\/])\.\.([\\/]|$)|[\\/]/.test(token))) {
    throw new Error("compile command executable or argument is not allowlisted");
  }
  return tokens;
}

export async function addTemplate(cwd: string, input: TemplateRegistrationInput, options: TemplateCompileOptions = {}): Promise<TemplateRecord> {
  if (!validName(input.name)) throw new Error("invalid template name");
  const extension = (input.extension ?? (extname(input.filePath ?? "").replace(/^\./, "") || "template")).toLowerCase();
  const content = input.content ?? (input.filePath ? await readFile(input.filePath, "utf8") : "");
  if (!content) throw new Error("template content is required");
  if (extension === "tex") validateTexSource(content);
  const tokens = input.compileCommand ? sanitizeCompileCommand(input.compileCommand) : undefined;
  const sourcePath = customPath(cwd, input.name);
  await mkdir(join(cwd, WORKSPACE_DIR, "templates"), { recursive: true });
  if (tokens) {
    await writeFile(sourcePath, content, { encoding: "utf8", flag: "wx" });
    try {
      await (options.runner ?? defaultRunner)(tokens[0], [...tokens.slice(1), sourcePath], { cwd: join(cwd, WORKSPACE_DIR, "templates"), timeout: options.timeoutMs ?? 10_000 });
    } catch (error) {
      await rm(sourcePath, { force: true });
      throw new Error(`template dummy compile failed: ${(error as Error).message}`);
    }
  } else {
    await writeFile(sourcePath, content, { encoding: "utf8", flag: "wx" });
  }
  const records = await readRegistry(cwd);
  if (records.some((record) => record.name === input.name)) throw new Error("template already registered");
  const record: TemplateRecord = { name: input.name, type: input.type ?? extension, extension, path: sourcePath, compileCommand: input.compileCommand, fonts: input.fonts ?? [], placeholders: input.placeholders ?? [...content.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1]), pageRules: input.pageRules ?? [], active: true, default: false };
  await writeJsonAtomic(registryPath(cwd), { schemaVersion: 1, templates: [...records.map((item) => ({ ...item, active: false })), record] });
  return record;
}

export async function listTemplates(cwd = process.cwd()): Promise<TemplateRecord[]> {
  const custom = await readRegistry(cwd);
  const builtIns = Object.entries(BUILT_INS).map(([name, value]) => ({ name, type: value.extension, extension: value.extension, path: new URL(`../templates/${value.file}`, import.meta.url).pathname, fonts: [], placeholders: [], pageRules: [], active: false, default: name === "cv" }));
  return [...builtIns, ...custom];
}

export async function selectTemplate(cwd: string, name: string): Promise<TemplateRecord> {
  const records = await listTemplates(cwd);
  const selected = records.find((record) => record.name === name);
  if (!selected) throw new Error(`unknown template: ${name}`);
  const custom = await readRegistry(cwd);
  await writeJsonAtomic(registryPath(cwd), { schemaVersion: 1, templates: custom.map((record) => ({ ...record, active: record.name === name })) });
  await writeJsonAtomic(activePath(cwd), { name, selectedAt: new Date().toISOString() });
  return { ...selected, active: true };
}

export async function setDefaultTemplate(cwd: string, name: string): Promise<TemplateRecord> {
  const selected = await selectTemplate(cwd, name);
  const records = await readRegistry(cwd);
  await writeJsonAtomic(registryPath(cwd), { schemaVersion: 1, templates: records.map((record) => ({ ...record, default: record.name === name })) });
  return { ...selected, default: true };
}

export async function resolveTemplate(name: TemplateName, cwd = process.cwd()): Promise<ResolvedTemplate> {
  if (!validName(name)) throw new Error("invalid template name");
  const custom = customPath(cwd, name);
  try {
    await access(custom);
    const record = (await readRegistry(cwd)).find((item) => item.name === name);
    return { name, extension: record?.extension ?? "template", path: custom, content: await readFile(custom, "utf8"), builtIn: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const builtIn = BUILT_INS[name];
  if (!builtIn) throw new Error(`unknown template: ${name}`);
  const path = new URL(`../templates/${builtIn.file}`, import.meta.url);
  return { name, extension: builtIn.extension, path: path.pathname, content: await readFile(path, "utf8"), builtIn: true };
}

export async function registerTemplate(cwd: string, name: string, content: string): Promise<string> {
  const path = customPath(cwd, name);
  await mkdir(join(cwd, WORKSPACE_DIR, "templates"), { recursive: true });
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
  return path;
}
