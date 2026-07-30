import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { extname } from "node:path";
import { load } from "cheerio";
import { normalizeJob, type HttpResponse, type NormalizedJob } from "./portals.js";

const MAX_POSTING_BYTES = 1_000_000;
const URL_TIMEOUT_MS = 15_000;
const MAX_IMPORT_ITEMS = 20;

export interface ImportInput {
  urls?: string[];
  text?: string;
  files?: string[];
}

export interface ImportedPosting {
  input: string;
  kind: "url" | "text" | "file";
  status: "complete" | "partial" | "failed";
  job: NormalizedJob | null;
  postingText: string | null;
  extractedFields: string[];
  missingFields: string[];
  error?: string;
}

export interface ImportResult {
  items: ImportedPosting[];
  summary: { complete: number; partial: number; failed: number };
}

export type ImportFetcher = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<HttpResponse>;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function compact(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function plainHtml(value: string): string {
  const $ = load(value);
  $("script, style, noscript, svg").remove();
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_POSTING_BYTES);
}

function sourceForUrl(url: URL): string {
  if (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com")) return "linkedin";
  if (url.hostname === "seek.com.au" || url.hostname.endsWith(".seek.com.au") || url.hostname === "seek.co.nz" || url.hostname.endsWith(".seek.co.nz")) return "seek";
  return url.hostname;
}

function safeExternalUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("invalid URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("URL must be a public HTTP(S) URL");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw new Error("private or local URLs are not allowed");
  return url;
}

function readJsonLd(document: ReturnType<typeof load>): Record<string, unknown> | null {
  for (const element of document("script[type='application/ld+json']").toArray()) {
    try {
      const parsed: unknown = JSON.parse(document(element).text());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const posting = candidates.find((item) => {
        const type = item && typeof item === "object" ? (item as Record<string, unknown>)["@type"] : undefined;
        return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      });
      if (posting && typeof posting === "object") return posting as Record<string, unknown>;
    } catch { /* malformed third-party JSON-LD is reported through missing fields */ }
  }
  return null;
}

function locationValue(record: Record<string, unknown>): string | null {
  const location = Array.isArray(record.jobLocation) ? record.jobLocation[0] : record.jobLocation;
  if (!location || typeof location !== "object") return compact(record.jobLocationType);
  const address = (location as Record<string, unknown>).address;
  if (!address || typeof address !== "object") return null;
  const value = address as Record<string, unknown>;
  return [value.addressLocality, value.addressRegion, value.addressCountry].map(compact).filter(Boolean).join(", ") || null;
}

function jsonLdJob(record: Record<string, unknown>, url: string, source: string): NormalizedJob {
  const organization = record.hiringOrganization && typeof record.hiringOrganization === "object" ? record.hiringOrganization as Record<string, unknown> : {};
  const salary = record.baseSalary && typeof record.baseSalary === "object" ? record.baseSalary as Record<string, unknown> : undefined;
  const salaryValue = salary?.value && typeof salary.value === "object" ? salary.value as Record<string, unknown> : undefined;
  const salaryNumber = typeof salaryValue?.value === "number" ? salaryValue.value : undefined;
  return normalizeJob({
    source, id: compact(record.identifier) ?? url, title: compact(record.title), company: compact(organization.name), location: locationValue(record),
    datePosted: compact(record.datePosted), url, description: plainHtml(compact(record.description) ?? ""), employmentType: compact(record.employmentType),
    remoteType: compact(record.jobLocationType)?.toLocaleLowerCase().includes("telecommute") ? "remote" : undefined,
    salary: salaryNumber === undefined ? undefined : { min: salaryNumber, max: salaryNumber, currency: compact(salary?.currency) ?? undefined },
    applicationUrl: url, attributionUrl: url,
  });
}

function metaJob(document: ReturnType<typeof load>, url: string, source: string): NormalizedJob {
  const value = (selector: string, attribute: string): string | null => compact(document(selector).first().attr(attribute));
  const title = value("meta[property='og:title']", "content") ?? compact(document("title").first().text());
  const description = value("meta[property='og:description']", "content") ?? value("meta[name='description']", "content");
  return normalizeJob({ source, id: url, title, company: null, location: null, datePosted: null, url, description, employmentType: null, applicationUrl: url, attributionUrl: url });
}

function mergeJob(primary: NormalizedJob, fallback: NormalizedJob): NormalizedJob {
  return normalizeJob({ ...fallback, ...primary, title: primary.title ?? fallback.title, company: primary.company ?? fallback.company, location: primary.location ?? fallback.location, datePosted: primary.datePosted ?? fallback.datePosted, description: primary.description ?? fallback.description, employmentType: primary.employmentType ?? fallback.employmentType });
}

function finish(input: string, kind: ImportedPosting["kind"], job: NormalizedJob | null, postingText: string | null, error?: string): ImportedPosting {
  const values: Record<string, unknown> = { title: job?.title, company: job?.company, location: job?.location, datePosted: job?.datePosted, description: postingText ?? job?.description };
  const extractedFields = Object.entries(values).filter(([, value]) => Boolean(value)).map(([key]) => key);
  const missingFields = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
  const status = job && extractedFields.length >= 4 ? "complete" : job && extractedFields.length > 0 ? "partial" : "failed";
  return { input, kind, status, job, postingText, extractedFields, missingFields, ...(error ? { error } : {}) };
}

async function importUrl(input: string, fetcher: ImportFetcher): Promise<ImportedPosting> {
  let url: URL;
  try { url = safeExternalUrl(input); } catch (error) { return finish(input, "url", null, null, error instanceof Error ? error.message : "invalid URL"); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_TIMEOUT_MS);
  try {
    const response = await fetcher(url.href, { headers: { accept: "text/html,application/xhtml+xml,text/plain" }, signal: controller.signal });
    const body = response.body.slice(0, MAX_POSTING_BYTES);
    const document = load(body);
    const source = sourceForUrl(url);
    const structured = readJsonLd(document);
    const fallback = metaJob(document, url.href, source);
    const job = structured ? mergeJob(jsonLdJob(structured, url.href, source), fallback) : fallback;
    const blocked = /captcha|verify you are human|access denied|login to continue|sign in to view/i.test(body);
    const visible = blocked ? "" : plainHtml(body);
    const postingText = visible.length >= 80 ? visible : job.description;
    const statusError = response.status < 200 || response.status >= 300 ? `HTTP ${response.status}` : blocked ? "page appears to be blocked or authentication-walled" : undefined;
    if (response.status < 200 || response.status >= 300) return finish(input, "url", job, postingText, statusError);
    return finish(input, "url", job, postingText, statusError);
  } catch (error) {
    return finish(input, "url", null, null, error instanceof Error && error.name === "AbortError" ? "request timed out" : error instanceof Error ? error.message : "request failed");
  } finally { clearTimeout(timer); }
}

async function importFile(input: string): Promise<ImportedPosting> {
  try {
    const info = await lstat(input);
    if (!info.isFile() || ![".txt", ".md"].includes(extname(input).toLocaleLowerCase())) return finish(input, "file", null, null, "only regular .txt and .md files are supported");
    if (info.size > MAX_POSTING_BYTES) return finish(input, "file", null, null, "file exceeds 1 MB limit");
    const path = await realpath(input);
    const content = await readFile(path, "utf8");
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
    const job = normalizeJob({ source: "file", id: hash(path), title, url: `file://${path}`, description: content, applicationUrl: `file://${path}` });
    return finish(input, "file", job, content);
  } catch (error) { return finish(input, "file", null, null, error instanceof Error ? error.message : "file could not be read"); }
}

export async function importPostings(input: ImportInput, fetcher: ImportFetcher = async (url, init) => {
  const response = await fetch(url, { ...init, redirect: "manual" });
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() };
}): Promise<ImportResult> {
  const itemCount = (input.text?.trim() ? 1 : 0) + (input.files?.length ?? 0) + (input.urls?.length ?? 0);
  if (itemCount > MAX_IMPORT_ITEMS) throw new Error(`at most ${MAX_IMPORT_ITEMS} postings can be imported at once`);
  const items: ImportedPosting[] = [];
  if (input.text?.trim()) items.push(finish("pasted text", "text", normalizeJob({ source: "text", id: hash(input.text), title: input.text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null, url: `text://${hash(input.text)}`, description: input.text }), input.text.slice(0, MAX_POSTING_BYTES)));
  for (const file of input.files ?? []) items.push(await importFile(file));
  for (const url of input.urls ?? []) items.push(await importUrl(url, fetcher));
  if (!items.length) throw new Error("provide pasted text, at least one .txt/.md file, or at least one URL");
  return { items, summary: { complete: items.filter((item) => item.status === "complete").length, partial: items.filter((item) => item.status === "partial").length, failed: items.filter((item) => item.status === "failed").length } };
}
