import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { BGW320Client, RouterSessionPoolFullError } from "../src/client.js";
import { clearSessionState, routerSessionIdentity, withRouterSession } from "../src/session.js";

test("coordinator reuses a cached router session across commands", async () => {
  await withTempSessionDir(async () => {
    const calls: string[] = [];
    await withFetch(async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname} ${String((init?.headers as Record<string, string> | undefined)?.Cookie ?? "")}`);
      if ((init?.method ?? "GET") === "POST") {
        return htmlResponse("", { status: 302, headers: { location: "/cgi-bin/home.ha", "set-cookie": "sid=abc; Path=/" } });
      }
      if (String(url).endsWith("/cgi-bin/diag.ha")) {
        return htmlResponse("<title>diag</title>");
      }
      return htmlResponse(loginNonceHtml("abc123"));
    }, async () => {
      const first = testClient();
      await withRouterSession(first, options(), () => first.login());
      const second = testClient();
      await withRouterSession(second, options(), () => second.getCgiPage("diag"));
    });

    expect(calls).toEqual([
      "GET /cgi-bin/login.ha ",
      "POST /cgi-bin/login.ha ",
      "GET /cgi-bin/diag.ha sid=abc",
    ]);
  });
});

test("coordinator cooldown prevents repeated pool-full login attempts", async () => {
  await withTempSessionDir(async () => {
    const calls: string[] = [];
    await withFetch(async (url) => {
      calls.push(String(url));
      return htmlResponse("<title>Login</title><p>all web server sessions are in use</p>");
    }, async () => {
      const first = testClient();
      await expect(withRouterSession(first, options(), () => first.login()))
        .rejects.toBeInstanceOf(RouterSessionPoolFullError);

      const second = testClient();
      await expect(withRouterSession(second, options(), () => second.login()))
        .rejects.toBeInstanceOf(RouterSessionPoolFullError);
    });

    expect(calls).toHaveLength(1);
  });
});

test("clearSessionState removes local cache and cooldown", async () => {
  await withTempSessionDir(async () => {
    await clearSessionState(routerSessionIdentity("http://router.local"));
  });
});

function options() {
  return {
    cacheTtlMs: 120000,
    poolCooldownMs: 300000,
    lockTimeoutMs: 1000,
    waitForSession: false,
  };
}

function testClient(): BGW320Client {
  return new BGW320Client({
    host: "http://router.local",
    accessCode: "12345",
    timeoutMs: 1000,
    insecureTls: true,
    userAgent: "test",
  });
}

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function withFetch(fetchImpl: FetchMock, fn: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withTempSessionDir(fn: () => Promise<void>): Promise<void> {
  const original = process.env.BGW_SESSION_CACHE_DIR;
  const dir = await mkdtemp(join(tmpdir(), "bgw-session-test-"));
  process.env.BGW_SESSION_CACHE_DIR = dir;
  try {
    await fn();
  } finally {
    if (original === undefined) {
      delete process.env.BGW_SESSION_CACHE_DIR;
    } else {
      process.env.BGW_SESSION_CACHE_DIR = original;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      "content-type": "text/html",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function loginNonceHtml(nonce: string): string {
  return `<title>Login</title><form><input name="nonce" value="${nonce}"><input name="password"></form>`;
}
