import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createGmailClient, GmailApiClient, type GmailClient, type GmailCredentialStatus } from "./gmail.js";

const execFile = promisify(execFileCallback);
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface OAuthTokenStore {
  load(): Promise<string | null>;
  save(refreshToken: string): Promise<void>;
}

export class OAuthNotConfiguredError extends Error {
  constructor(message = "Gmail OAuth is not configured") { super(message); this.name = "OAuthNotConfiguredError"; }
}

export class GmailOAuthError extends Error {
  constructor(message: string) { super(message); this.name = "GmailOAuthError"; }
}

export class FileTokenStore implements OAuthTokenStore {
  constructor(private readonly path = join(process.env.HOME ?? homedir(), ".config", "pi-job-search", "gmail-refresh-token.json")) {}
  async load(): Promise<string | null> {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8")) as { refreshToken?: unknown };
      return typeof value.refreshToken === "string" && value.refreshToken ? value.refreshToken : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async save(refreshToken: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await writeFile(this.path, `${JSON.stringify({ refreshToken })}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(this.path, 0o600);
  }
}

export class MacOSKeychainTokenStore implements OAuthTokenStore {
  constructor(private readonly service = "@sovorn/pi-job-search/gmail", private readonly account = process.env.USER ?? "user") {}
  async load(): Promise<string | null> {
    try {
      const result = await execFile("security", ["find-generic-password", "-a", this.account, "-s", this.service, "-w"], { timeout: 5_000 });
      return result.stdout.trim() || null;
    } catch (error) {
      throw error;
    }
  }
  async save(refreshToken: string): Promise<void> {
    await execFile("security", ["add-generic-password", "-U", "-a", this.account, "-s", this.service, "-w", refreshToken], { timeout: 5_000 });
  }
}

class FallbackTokenStore implements OAuthTokenStore {
  constructor(private readonly primary: OAuthTokenStore, private readonly fallback: OAuthTokenStore) {}
  async load(): Promise<string | null> {
    try { return await this.primary.load(); } catch { return this.fallback.load(); }
  }
  async save(refreshToken: string): Promise<void> {
    try { await this.primary.save(refreshToken); } catch { await this.fallback.save(refreshToken); }
  }
}

export function createDefaultGmailTokenStore(env: NodeJS.ProcessEnv = process.env): OAuthTokenStore {
  const file = new FileTokenStore(join(env.HOME ?? homedir(), ".config", "pi-job-search", "gmail-refresh-token.json"));
  return process.platform === "darwin" ? new FallbackTokenStore(new MacOSKeychainTokenStore(undefined, env.USER ?? "user"), file) : file;
}

export interface PkcePair { verifier: string; challenge: string; }
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export interface GmailOAuthOptions {
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  store?: OAuthTokenStore;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  openBrowser?: (url: string) => Promise<void>;
}

export interface GmailAuthorizationResult {
  expiresIn: number;
  storedRefreshToken: boolean;
}

async function openBrowser(url: string): Promise<void> {
  if (process.platform === "darwin") await execFile("open", [url], { timeout: 5_000 });
  else if (process.platform === "win32") await execFile("rundll32.exe", ["url.dll,FileProtocolHandler", url], { timeout: 5_000 });
  else await execFile("xdg-open", [url], { timeout: 5_000 });
}

function tokenError(status: number): GmailOAuthError {
  return new GmailOAuthError(`Google OAuth token request failed with status ${status}`);
}

async function exchangeCode(options: GmailOAuthOptions, code: string, verifier: string, redirectUri: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const body = new URLSearchParams({ client_id: options.clientId, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri });
  if (options.clientSecret) body.set("client_secret", options.clientSecret);
  const response = await (options.fetchImpl ?? fetch)(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  if (!response.ok) throw tokenError(response.status);
  const value = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof value.access_token !== "string" || typeof value.expires_in !== "number") throw new GmailOAuthError("Google OAuth returned an incomplete token response");
  return { accessToken: value.access_token, refreshToken: typeof value.refresh_token === "string" ? value.refresh_token : undefined, expiresIn: value.expires_in };
}

export async function authorizeGmail(options: GmailOAuthOptions): Promise<GmailAuthorizationResult> {
  if (!options.clientId) throw new OAuthNotConfiguredError("GMAIL_CLIENT_ID is required");
  const store = options.store ?? createDefaultGmailTokenStore();
  const pkce = createPkcePair();
  const state = randomBytes(24).toString("base64url");
  const server = createServer();
  const callback = new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    server.on("request", (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/oauth/callback") { response.writeHead(404).end(); return; }
      if (url.searchParams.get("state") !== state) { response.writeHead(400).end("Invalid OAuth state"); return; }
      const error = url.searchParams.get("error");
      if (error) { response.writeHead(400).end("Authorization was denied"); reject(new GmailOAuthError("Google authorization was denied")); return; }
      const code = url.searchParams.get("code");
      if (!code) { response.writeHead(400).end("Missing authorization code"); reject(new GmailOAuthError("Google authorization returned no code")); return; }
      const address = server.address() as AddressInfo;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<p>Gmail authorization complete. You can close this window.</p>");
      resolve({ code, redirectUri: `http://127.0.0.1:${address.port}/oauth/callback` });
    });
    server.on("error", reject);
  });
  await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", () => resolve()).on("error", reject));
  const address = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;
  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", options.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", (options.scopes ?? [GMAIL_READONLY_SCOPE]).join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", pkce.challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  const timer = setTimeout(() => callback.catch(() => undefined), options.timeoutMs ?? 120_000);
  try {
    await (options.openBrowser ?? openBrowser)(authUrl.href);
    const result = await Promise.race([callback, new Promise<never>((_, reject) => setTimeout(() => reject(new GmailOAuthError("Gmail authorization timed out")), options.timeoutMs ?? 120_000))]);
    const token = await exchangeCode(options, result.code, pkce.verifier, result.redirectUri);
    if (token.refreshToken) await store.save(token.refreshToken);
    else if (!(await store.load())) throw new GmailOAuthError("Google did not return a refresh token; revoke access and authorize again");
    return { expiresIn: token.expiresIn, storedRefreshToken: Boolean(token.refreshToken) };
  } finally {
    clearTimeout(timer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export interface RefreshOptions extends Pick<GmailOAuthOptions, "clientId" | "clientSecret" | "fetchImpl"> { store?: OAuthTokenStore; refreshToken?: string; }
export async function refreshGmailAccessToken(options: RefreshOptions): Promise<{ accessToken: string; expiresIn: number }> {
  if (!options.clientId) throw new OAuthNotConfiguredError("GMAIL_CLIENT_ID is required");
  const refreshToken = options.refreshToken ?? await (options.store ?? createDefaultGmailTokenStore()).load();
  if (!refreshToken) throw new OAuthNotConfiguredError("No Gmail refresh token is stored; run Gmail authorization first");
  const body = new URLSearchParams({ client_id: options.clientId, refresh_token: refreshToken, grant_type: "refresh_token" });
  if (options.clientSecret) body.set("client_secret", options.clientSecret);
  const response = await (options.fetchImpl ?? fetch)(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  if (!response.ok) throw tokenError(response.status);
  const value = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof value.access_token !== "string" || typeof value.expires_in !== "number") throw new GmailOAuthError("Google OAuth returned an incomplete refresh response");
  return { accessToken: value.access_token, expiresIn: value.expires_in };
}

export async function createAuthorizedGmailClient(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch, store?: OAuthTokenStore): Promise<{ client?: GmailClient; credentials: GmailCredentialStatus & { source: GmailCredentialStatus["source"] | "oauth-refresh" } }> {
  const direct = createGmailClient(env, fetchImpl);
  if (direct.client) return direct;
  if (!env.GMAIL_CLIENT_ID) return { client: undefined, credentials: direct.credentials };
  try {
    const token = await refreshGmailAccessToken({ clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, refreshToken: env.GMAIL_REFRESH_TOKEN, store: store ?? createDefaultGmailTokenStore(env), fetchImpl });
    return { client: new GmailApiClient(token.accessToken, fetchImpl), credentials: { configured: true, source: "oauth-refresh" } };
  } catch (error) {
    if (error instanceof OAuthNotConfiguredError) return { client: undefined, credentials: { configured: false, source: null } };
    throw error;
  }
}
