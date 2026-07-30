import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WORKSPACE_DIR } from "./workspace.js";

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

export interface ResolvedTemplate {
  name: string;
  extension: string;
  path: string;
  content: string;
  builtIn: boolean;
}

export async function resolveTemplate(name: TemplateName, cwd = process.cwd()): Promise<ResolvedTemplate> {
  if (!validName(name)) throw new Error("invalid template name");
  const custom = customPath(cwd, name);
  try {
    await access(custom);
    return { name, extension: "template", path: custom, content: await readFile(custom, "utf8"), builtIn: false };
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
