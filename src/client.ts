import { createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import type { HttpMethod, HttpResponse, RouterClientOptions, RouterSessionSnapshot } from "./types.js";
import { looksLikeLogin } from "./parser.js";

class RouterError extends Error {}
export class RouterAuthError extends RouterError {}
export class RouterConnectionError extends RouterError {}
export class RouterSessionPoolFullError extends RouterAuthError {
  readonly sessionPoolFull = true;
  readonly waitedMs: number;
  readonly retryCount: number;

  constructor(message = "Router web session pool is full.", options: { waitedMs?: number; retryCount?: number } = {}) {
    super(message);
    this.name = "RouterSessionPoolFullError";
    this.waitedMs = options.waitedMs ?? 0;
    this.retryCount = options.retryCount ?? 0;
  }
}

type RequestOptions = {
  method?: HttpMethod;
  body?: URLSearchParams | string;
  headers?: Record<string, string>;
  followRedirects?: boolean;
};

export class BGW320Client {
  private readonly baseUrl: URL;
  private readonly options: RouterClientOptions;
  private readonly cookies = new Map<string, string>();
  private authenticated = false;

  constructor(options: RouterClientOptions) {
    const host = options.host.replace(/\/+$/, "");
    this.baseUrl = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
    this.options = options;
  }

  sessionIdentity(): string {
    return this.baseUrl.origin;
  }

  hasAuthenticatedSession(): boolean {
    return this.authenticated && this.cookies.size > 0;
  }

  exportSession(): RouterSessionSnapshot {
    return {
      origin: this.baseUrl.origin,
      authenticated: this.authenticated,
      cookies: Object.fromEntries(this.cookies.entries()),
    };
  }

  importSession(snapshot: RouterSessionSnapshot): void {
    if (snapshot.origin !== this.baseUrl.origin || snapshot.authenticated !== true) return;
    this.cookies.clear();
    for (const [name, value] of Object.entries(snapshot.cookies)) {
      if (name && value) this.cookies.set(name, value);
    }
    this.authenticated = this.cookies.size > 0;
  }

  clearSession(): void {
    this.cookies.clear();
    this.authenticated = false;
  }

  async check(): Promise<{ host: string; reachable: boolean; title: string; authenticated: boolean }> {
    const response = await this.getCgiPage("sitemap", { auth: false });
    return {
      host: this.baseUrl.host,
      reachable: response.statusCode >= 200 && response.statusCode < 500,
      title: titleOf(response.body),
      authenticated: this.authenticated,
    };
  }

  async getCgiPage(page: string, options: { auth?: boolean } = {}): Promise<HttpResponse> {
    const response = await this.request(`/cgi-bin/${page}.ha`, { method: "GET" });
    if (options.auth === false) return response;

    if (looksLikeLogin(response.body)) {
      await this.login(response.body, { force: true });
      const retry = await this.request(`/cgi-bin/${page}.ha`, { method: "GET" });
      if (looksLikeLogin(retry.body)) {
        this.authenticated = false;
        throw new RouterAuthError("Router returned the login page after authentication. Wait for stale router web sessions to expire, then retry.");
      }
      return retry;
    }

    return response;
  }

  async postCgiPage(page: string, fields: Record<string, string>): Promise<HttpResponse> {
    const current = await this.getCgiPage(page);
    const nonce = extractNonce(current.body);
    const body = new URLSearchParams({ ...fields });
    if (nonce && !body.has("nonce")) body.set("nonce", nonce);

    return this.request(`/cgi-bin/${page}.ha`, {
      method: "POST",
      body,
      followRedirects: false,
      headers: {
        Referer: new URL(`/cgi-bin/${page}.ha`, this.baseUrl).toString(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  }

  async login(initialLoginHtml?: string, options: { force?: boolean } = {}): Promise<void> {
    if (this.authenticated && !options.force) return;
    if (options.force) this.authenticated = false;
    if (!this.options.accessCode) {
      throw new RouterAuthError("Access code required. Set BGW_ACCESS_CODE or pass --access-code-stdin.");
    }

    let nonce: string | undefined = initialLoginHtml ? extractNonce(initialLoginHtml) : undefined;
    if (!nonce && initialLoginHtml && routerSessionsFull(initialLoginHtml)) {
      nonce = await this.waitForSessionNonce();
    }
    for (let attempt = 0; attempt < 8 && !nonce; attempt += 1) {
      if (attempt > 1) this.cookies.clear();
      let loginPage = await this.request("/cgi-bin/login.ha", { method: "GET" });
      if (routerSessionsFull(loginPage.body)) {
        nonce = await this.waitForSessionNonce();
        break;
      }
      nonce = extractNonce(loginPage.body);
      if (!nonce) {
        await sleep(150 + attempt * 100);
        loginPage = await this.request("/cgi-bin/login.ha", { method: "GET" });
        if (routerSessionsFull(loginPage.body)) {
          nonce = await this.waitForSessionNonce();
          break;
        }
        nonce = extractNonce(loginPage.body);
      }
      if (!nonce) await sleep(250 + attempt * 150);
    }

    if (!nonce) {
      throw new RouterAuthError("Router did not return a login nonce after retrying the cookie handshake.");
    }

    const hashpassword = createHash("md5").update(`${this.options.accessCode}${nonce}`).digest("hex");
    const body = new URLSearchParams({
      nonce,
      password: "*".repeat(this.options.accessCode.length),
      hashpassword,
      Continue: "Continue",
    });

    const response = await this.request("/cgi-bin/login.ha", {
      method: "POST",
      body,
      followRedirects: false,
      headers: {
        Referer: new URL("/cgi-bin/login.ha", this.baseUrl).toString(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.statusCode === 302 && /\/cgi-bin\/home\.ha/i.test(String(response.headers.location ?? ""))) {
      this.authenticated = true;
      return;
    }

    if (looksLikeLogin(response.body) || /Login Failed|Access Code Required/i.test(response.body)) {
      throw new RouterAuthError("Login failed. Check the device access code.");
    }

    this.authenticated = true;
  }

  private async waitForSessionNonce(): Promise<string | undefined> {
    if (this.options.waitForSession !== true) {
      throw new RouterSessionPoolFullError();
    }

    const timeoutMs = Math.max(0, this.options.sessionWaitTimeoutMs ?? 120000);
    const intervalMs = Math.max(1, this.options.sessionWaitIntervalMs ?? 10000);
    const start = Date.now();
    let retryCount = 0;
    let waitedMs = 0;

    while (waitedMs < timeoutMs) {
      this.options.onSessionWait?.({ waitedMs, retryCount, timeoutMs, intervalMs });
      await sleep(Math.min(intervalMs, Math.max(0, timeoutMs - waitedMs)));
      retryCount += 1;
      waitedMs = Date.now() - start;
      const loginPage = await this.request("/cgi-bin/login.ha", { method: "GET" });
      if (routerSessionsFull(loginPage.body)) continue;
      return extractNonce(loginPage.body);
    }

    throw new RouterSessionPoolFullError("Router web session pool is full.", {
      waitedMs: timeoutMs,
      retryCount,
    });
  }

  private async request(path: string, options: RequestOptions): Promise<HttpResponse> {
    const url = new URL(path, this.baseUrl);
    const body = typeof options.body === "string" ? options.body : options.body?.toString();
    const headers: Record<string, string> = {
      "User-Agent": this.options.userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Connection: "close",
      ...options.headers,
    };

    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    if (body) headers["Content-Length"] = String(Buffer.byteLength(body));

    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        signal: controller.signal,
        redirect: "manual",
        body,
        ...(url.protocol === "https:" ? { tls: { rejectUnauthorized: !this.options.insecureTls } } : {}),
      } as RequestInit & { tls?: { rejectUnauthorized: boolean } });

      this.storeCookies(getSetCookies(response.headers));
      const responseHeaders = headersToRecord(response.headers);
      const text = await response.text();
      const result: HttpResponse = {
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: responseHeaders,
        body: text,
        url: url.toString(),
      };

      const location = response.headers.get("location");
      if (options.followRedirects !== false && response.status >= 300 && response.status < 400 && location) {
        const redirectUrl = new URL(location, url);
        return this.request(`${redirectUrl.pathname}${redirectUrl.search}`, { method: "GET" });
      }

      return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new RouterConnectionError(`Timed out connecting to ${url.toString()}`);
      }
      throw error instanceof RouterError ? error : new RouterConnectionError(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(deadline);
    }
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private storeCookies(setCookie: string[] | string | undefined): void {
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    for (const cookie of cookies) {
      const [pair] = cookie.split(";");
      const [name, value] = pair?.split("=") ?? [];
      if (name && value) this.cookies.set(name, value);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headersToRecord(headers: Headers): Record<string, string | string[] | undefined> {
  const record: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    record[key.toLowerCase()] = value;
  }
  return record;
}

function getSetCookies(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  const values = withGetter.getSetCookie?.();
  if (values && values.length > 0) return values;

  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return combined.split(/,(?=[^;,]+=)/);
}

function extractNonce(html: string): string | undefined {
  const direct = html.match(/name=["']nonce["'][^>]*value=["']([a-f0-9]+)["']/i);
  if (direct?.[1]) return direct[1];
  const reverse = html.match(/value=["']([a-f0-9]+)["'][^>]*name=["']nonce["']/i);
  return reverse?.[1];
}

function routerSessionsFull(html: string): boolean {
  return /all web server sessions are in use/i.test(html);
}

function titleOf(html: string): string {
  return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
}
