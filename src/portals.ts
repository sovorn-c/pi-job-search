import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";

export type PortalName = "linkedin" | "freehire" | "jobindex" | "jobnet" | "jobbank" | "jobdanmark";
export type PortalErrorCode = "http" | "timeout" | "parse" | "rate_limit" | "source" | "network";

export interface SearchQuery {
  query: string;
  location?: string;
  limit?: number;
}

export interface RequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
}

export type HttpClient = (url: string, init?: RequestInitLike, signal?: AbortSignal) => Promise<HttpResponse>;

export interface NormalizedJob {
  source: PortalName | string;
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  datePosted: string | null;
  url: string;
  description: string | null;
  employmentType: string | null;
}

export interface PortalSearchResult {
  jobs: NormalizedJob[];
  warnings: string[];
}

export interface PortalAdapter {
  name: string;
  search(query: SearchQuery, signal?: AbortSignal): Promise<PortalSearchResult>;
  detail(idOrUrl: string, signal?: AbortSignal): Promise<NormalizedJob | null>;
}

export class PortalError extends Error {
  constructor(
    message: string,
    public readonly code: PortalErrorCode,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PortalError";
  }
}

export interface RetryPolicy {
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const DEFAULT_RETRY: Required<RetryPolicy> = {
  maxRetries: 2,
  timeoutMs: 15_000,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelay(response: HttpResponse, attempt: number): number {
  const retryAfter = Number(response.headers["retry-after"] ?? "");
  return Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5_000) : Math.min(250 * 2 ** attempt, 2_000);
}

export async function requestWithRetry(
  url: string,
  fetcher: HttpClient,
  policy: RetryPolicy = {},
  init: RequestInitLike = {},
  parentSignal?: AbortSignal,
): Promise<HttpResponse> {
  const options = { ...DEFAULT_RETRY, ...policy };
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    if (parentSignal?.aborted) throw new PortalError("portal request cancelled", "network");
    const controller = new AbortController();
    const abort = () => controller.abort();
    parentSignal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetcher(url, init, controller.signal);
      if (response.status >= 200 && response.status < 300) return response;
      if (!retryable(response.status) || attempt === options.maxRetries) {
        const code = response.status === 429 ? "rate_limit" : "http";
        throw new PortalError(`portal returned ${response.status}`, code, response.status);
      }
      await options.sleep(retryDelay(response, attempt));
    } catch (error) {
      if (error instanceof PortalError && error.code !== "rate_limit" && error.code !== "http") throw error;
      if (error instanceof PortalError && error.status && !retryable(error.status)) throw error;
      if (attempt === options.maxRetries) {
        if (controller.signal.aborted) throw new PortalError("portal request timed out", "timeout");
        if (error instanceof PortalError) throw error;
        throw new PortalError(error instanceof Error ? error.message : "portal request failed", "network");
      }
      await options.sleep(250 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abort);
    }
  }
  throw new PortalError("portal request failed", "network");
}

export function createHttpClient(fetchImpl: typeof fetch = fetch, policy: RetryPolicy = {}): HttpClient {
  return (url, init, signal) => requestWithRetry(url, async (target, request, requestSignal) => {
    const response = await fetchImpl(target, { ...request, signal: requestSignal } as RequestInit);
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    };
  }, policy, init, signal);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nested(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
  return null;
}

export function normalizeJob(input: Partial<NormalizedJob> & Record<string, unknown>): NormalizedJob {
  const url = text(input.url) ?? "";
  return {
    source: text(input.source) ?? "unknown",
    id: text(input.id) ?? url,
    title: text(input.title),
    company: text(input.company),
    location: text(input.location),
    datePosted: text(input.datePosted),
    url,
    description: text(input.description),
    employmentType: text(input.employmentType),
  };
}

function fromRecord(source: PortalName, record: Record<string, unknown>, baseUrl: string): NormalizedJob {
  const rawUrl = text(nested(record, ["url", "link", "jobUrl", "href"])) ?? "";
  const url = rawUrl ? new URL(rawUrl, baseUrl).href : baseUrl;
  const companyValue = nested(record, ["company", "companyName", "organization"]);
  const company = typeof companyValue === "object" && companyValue !== null
    ? text((companyValue as Record<string, unknown>).name)
    : text(companyValue);
  return normalizeJob({
    source,
    id: text(nested(record, ["id", "guid", "slug"])) ?? url,
    title: text(nested(record, ["title", "jobTitle", "name"])),
    company,
    location: text(nested(record, ["location", "city", "jobLocation"])),
    datePosted: text(nested(record, ["datePosted", "posted", "posted_at", "published", "date", "pubDate"])),
    url,
    description: text(nested(record, ["description", "summary"])),
    employmentType: text(nested(record, ["employmentType", "type"])),
  });
}

function safeSourceUrl(value: string, hosts: string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PortalError("invalid portal URL", "source");
  }
  if (!hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new PortalError("URL is outside the portal source allowlist", "source");
  }
  return parsed.href;
}

function parseRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["jobs", "jobPostings", "results", "items", "data"]) {
    const child = record[key];
    if (Array.isArray(child)) return parseRecords(child);
    if (child && typeof child === "object") {
      const nestedRecords = parseRecords(child);
      if (nestedRecords.length) return nestedRecords;
    }
  }
  return [];
}

export function parseLinkedInHtml(html: string): NormalizedJob[] {
  const $ = load(html);
  return $(".base-card").map((_index, element) => normalizeJob({
    source: "linkedin",
    id: text($(element).find("a.base-card__full-link").attr("href"))?.match(/(\d+)(?:[/?#]|$)/)?.[1],
    title: $(element).find(".base-search-card__title").text(),
    company: $(element).find(".base-search-card__subtitle").text(),
    location: $(element).find(".job-search-card__location").text(),
    datePosted: $(element).find("time").attr("datetime"),
    url: $(element).find("a.base-card__full-link").attr("href"),
  })).get();
}

export function parseFreehireJson(payload: unknown): NormalizedJob[] {
  return parseRecords(payload).map((record) => fromRecord("freehire", record, "https://freehire.co"));
}

export function parseJobindexHtml(html: string): NormalizedJob[] {
  const match = html.match(/var\s+Stash\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!match) return [];
  try {
    return parseRecords(JSON.parse(match[1])).map((record) => fromRecord("jobindex", record, "https://www.jobindex.dk"));
  } catch (error) {
    throw new PortalError(error instanceof Error ? error.message : "invalid Jobindex Stash JSON", "parse");
  }
}

export function parseJobnetJson(payload: unknown): NormalizedJob[] {
  return parseRecords(payload).map((record) => fromRecord("jobnet", record, "https://job.jobnet.dk"));
}

export function parseJobbankRss(xml: string): NormalizedJob[] {
  try {
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const items = parsed?.rss?.channel?.item ?? [];
    return (Array.isArray(items) ? items : [items]).map((record) => fromRecord("jobbank", {
      ...record,
      company: record.company ?? record.description,
    }, "https://jobbank.dk"));
  } catch (error) {
    throw new PortalError(error instanceof Error ? error.message : "invalid Jobbank RSS", "parse");
  }
}

export function parseJobdanmarkJson(payload: unknown): NormalizedJob[] {
  return parseRecords(payload).map((record) => fromRecord("jobdanmark", record, "https://jobdanmark.dk"));
}

export function parseJobPostingJsonLd(html: string, url: string, source: PortalName = "jobbank"): NormalizedJob {
  const $ = load(html);
  const script = $("script[type='application/ld+json']").first().text();
  try {
    const payload = JSON.parse(script) as Record<string, unknown>;
    const posting = Array.isArray(payload) ? payload.find((item) => item && typeof item === "object" && (item as Record<string, unknown>)["@type"] === "JobPosting") : payload;
    const record = (posting ?? payload) as Record<string, unknown>;
    const location = record.jobLocation as Record<string, unknown> | undefined;
    const address = location?.address as Record<string, unknown> | undefined;
    return normalizeJob({
      source,
      id: url,
      title: text(record.title),
      company: text((record.hiringOrganization as Record<string, unknown> | undefined)?.name),
      location: text(address?.addressLocality),
      datePosted: text(record.datePosted),
      url,
      description: text(record.description),
      employmentType: text(record.employmentType),
    });
  } catch (error) {
    throw new PortalError(error instanceof Error ? error.message : "invalid JobPosting JSON-LD", "parse");
  }
}

function queryUrl(base: string, query: SearchQuery): string {
  const url = new URL(base);
  url.searchParams.set("query", query.query);
  if (query.location) url.searchParams.set("location", query.location);
  if (query.limit) url.searchParams.set("limit", String(query.limit));
  return url.href;
}

function jsonAdapter(
  name: PortalName,
  searchEndpoint: string,
  detailBase: string,
  http: HttpClient,
  parse: (payload: unknown) => NormalizedJob[],
  init?: RequestInitLike,
): PortalAdapter {
  return {
    name,
    async search(query, signal) {
      const response = await http(queryUrl(searchEndpoint, query), init, signal);
      return { jobs: parse(JSON.parse(response.body)), warnings: [] };
    },
    async detail(idOrUrl, signal) {
      const url = safeSourceUrl(idOrUrl.startsWith("http") ? idOrUrl : `${detailBase}/${idOrUrl}`, [new URL(detailBase).hostname]);
      const response = await http(url, init, signal);
      const jobs = parse(JSON.parse(response.body));
      return jobs[0] ?? null;
    },
  };
}

export function createLinkedInAdapter(http: HttpClient): PortalAdapter {
  return {
    name: "linkedin",
    async search(query, signal) {
      const response = await http(queryUrl("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search", query), undefined, signal);
      return { jobs: parseLinkedInHtml(response.body), warnings: ["LinkedIn jobs guest is public and may change; no authentication was used."] };
    },
    async detail(idOrUrl, signal) {
      const url = safeSourceUrl(idOrUrl.startsWith("http") ? idOrUrl : `https://www.linkedin.com/jobs/view/${idOrUrl}`, ["linkedin.com"]);
      const response = await http(url, undefined, signal);
      return parseLinkedInHtml(response.body)[0] ?? null;
    },
  };
}

export function createFreehireAdapter(http: HttpClient): PortalAdapter {
  return jsonAdapter("freehire", "https://freehire.co/api/v1/agent/jobs/search", "https://freehire.co/jobs", http, parseFreehireJson);
}

export function createJobindexAdapter(http: HttpClient): PortalAdapter {
  return {
    name: "jobindex",
    async search(query, signal) {
      const response = await http(queryUrl("https://www.jobindex.dk/jobsoegning", query), undefined, signal);
      return { jobs: parseJobindexHtml(response.body), warnings: [] };
    },
    async detail(idOrUrl, signal) {
      const url = safeSourceUrl(idOrUrl.startsWith("http") ? idOrUrl : `https://www.jobindex.dk/job/${idOrUrl}`, ["jobindex.dk"]);
      const response = await http(url, undefined, signal);
      return parseJobPostingJsonLd(response.body, url, "jobindex");
    },
  };
}

export function createJobnetAdapter(http: HttpClient): PortalAdapter {
  return jsonAdapter("jobnet", "https://job.jobnet.dk/bff/FindJob/Search", "https://job.jobnet.dk/job", http, parseJobnetJson, { headers: { "x-csrf": "1" } });
}

export function createJobbankAdapter(http: HttpClient): PortalAdapter {
  return {
    name: "jobbank",
    async search(query, signal) {
      const response = await http(queryUrl("https://jobbank.dk/job/rss", query), undefined, signal);
      return { jobs: parseJobbankRss(response.body), warnings: [] };
    },
    async detail(idOrUrl, signal) {
      const url = safeSourceUrl(idOrUrl.startsWith("http") ? idOrUrl : `https://jobbank.dk/job/${idOrUrl}`, ["jobbank.dk"]);
      const response = await http(url, undefined, signal);
      return parseJobPostingJsonLd(response.body, url, "jobbank");
    },
  };
}

export function createJobdanmarkAdapter(http: HttpClient): PortalAdapter {
  return {
    name: "jobdanmark",
    async search(query, signal) {
      const response = await http("https://jobdanmark.dk/api/jobsearch/search/1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: query.query, displayText: query.query, location: query.location ?? "", page: 1 }),
      }, signal);
      return { jobs: parseJobdanmarkJson(JSON.parse(response.body)), warnings: [] };
    },
    async detail(idOrUrl, signal) {
      const url = safeSourceUrl(idOrUrl.startsWith("http") ? idOrUrl : `https://jobdanmark.dk/job/${idOrUrl}`, ["jobdanmark.dk"]);
      const response = await http(url, undefined, signal);
      return parseJobPostingJsonLd(response.body, url, "jobdanmark");
    },
  };
}

export function createPortalRegistry(http: HttpClient): Map<PortalName, PortalAdapter> {
  return new Map([
    ["linkedin", createLinkedInAdapter(http)],
    ["freehire", createFreehireAdapter(http)],
    ["jobindex", createJobindexAdapter(http)],
    ["jobnet", createJobnetAdapter(http)],
    ["jobbank", createJobbankAdapter(http)],
    ["jobdanmark", createJobdanmarkAdapter(http)],
  ]);
}
