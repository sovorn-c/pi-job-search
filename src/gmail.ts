import { Buffer } from "node:buffer";

export interface GmailMessageRef {
  id: string;
  threadId?: string;
}

export interface GmailListResponse {
  messages?: GmailMessageRef[];
  nextPageToken?: string;
}

export interface GmailBody {
  data?: string;
}

export interface GmailPart {
  mimeType?: string;
  body?: GmailBody;
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
}

export interface GmailClient {
  list(query: string, pageToken?: string): Promise<GmailListResponse>;
  get(messageId: string): Promise<GmailMessage>;
}

export interface GmailCredentialStatus {
  configured: boolean;
  source: "GMAIL_TOKEN" | "GMAIL_ACCESS_TOKEN" | null;
}

export class GmailApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "GmailApiError";
  }
}

export function getGmailCredentialStatus(env: NodeJS.ProcessEnv = process.env): GmailCredentialStatus {
  if (env.GMAIL_TOKEN) return { configured: true, source: "GMAIL_TOKEN" };
  if (env.GMAIL_ACCESS_TOKEN) return { configured: true, source: "GMAIL_ACCESS_TOKEN" };
  return { configured: false, source: null };
}

export function redactSecrets(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === "string") {
    return secrets.filter(Boolean).sort((a, b) => b.length - a.length).reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value);
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /token|secret|authorization|password/i.test(key) ? "[redacted]" : redactSecrets(item, secrets),
    ]));
  }
  return value;
}

export class GmailApiClient implements GmailClient {
  private readonly baseUrl: string;
  constructor(private readonly accessToken: string, private readonly fetchImpl: typeof fetch = fetch, baseUrl = "https://gmail.googleapis.com/gmail/v1") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async list(query: string, pageToken?: string): Promise<GmailListResponse> {
    const url = new URL(`${this.baseUrl}/users/me/messages`);
    if (query) url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    return this.request<GmailListResponse>(url);
  }

  async get(messageId: string): Promise<GmailMessage> {
    if (!/^[A-Za-z0-9_-]+$/.test(messageId)) throw new Error("invalid Gmail message id");
    return this.request<GmailMessage>(new URL(`${this.baseUrl}/users/me/messages/${messageId}?format=full`));
  }

  private async request<T>(url: URL): Promise<T> {
    const response = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" } });
    if (!response.ok) throw new GmailApiError(response.status, `Gmail API request failed with status ${response.status}`);
    return await response.json() as T;
  }
}

export function createGmailClient(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): { client?: GmailClient; credentials: GmailCredentialStatus } {
  const credentials = getGmailCredentialStatus(env);
  const token = env.GMAIL_TOKEN ?? env.GMAIL_ACCESS_TOKEN;
  return { client: token ? new GmailApiClient(token, fetchImpl) : undefined, credentials };
}

export async function listAllMessages(client: GmailClient, query: string, maxMessages = 500): Promise<GmailMessageRef[]> {
  const messages: GmailMessageRef[] = [];
  let pageToken: string | undefined;
  do {
    const page = await client.list(query, pageToken);
    for (const message of page.messages ?? []) {
      if (message.id && messages.length < maxMessages) messages.push(message);
      if (messages.length >= maxMessages) return messages;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return messages;
}

export async function getFullMessages(client: GmailClient, refs: GmailMessageRef[]): Promise<GmailMessage[]> {
  return Promise.all(refs.map((ref) => client.get(ref.id)));
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function collectParts(part: GmailPart | undefined, output: Array<{ mimeType: string; text: string }>): void {
  if (!part) return;
  if (part.body?.data) output.push({ mimeType: part.mimeType ?? "", text: decodeBase64Url(part.body.data) });
  for (const child of part.parts ?? []) collectParts(child, output);
}

export function extractMessageText(message: GmailMessage): string {
  const parts: Array<{ mimeType: string; text: string }> = [];
  collectParts(message.payload, parts);
  const plain = parts.filter((part) => part.mimeType === "text/plain").map((part) => part.text).join("\n");
  if (plain) return plain;
  return parts.filter((part) => part.mimeType === "text/html").map((part) => part.text.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("\n");
}

export function getMessageHeader(message: GmailMessage, name: string): string | undefined {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
}
