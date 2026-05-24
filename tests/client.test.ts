import { expect, test } from "bun:test";
import { BGW320Client, RouterAuthError, RouterSessionPoolFullError } from "../src/client.js";

test("session-pool-full fails fast by default", async () => {
  const calls: string[] = [];
  await withFetch(async (url) => {
    calls.push(String(url));
    return htmlResponse("<title>Login</title><p>all web server sessions are in use</p>");
  }, async () => {
    const client = testClient();
    await expect(client.login()).rejects.toBeInstanceOf(RouterSessionPoolFullError);
    expect(calls).toHaveLength(1);
  });
});

test("waitForSession retries only the session-pool-full condition", async () => {
  const calls: string[] = [];
  const waitEvents: unknown[] = [];

  await withFetch(async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
    if (calls.length === 1) return htmlResponse("<title>Login</title><p>all web server sessions are in use</p>");
    if (calls.length === 2) return htmlResponse(loginNonceHtml("abc123"));
    return htmlResponse("", { status: 302, headers: { location: "/cgi-bin/home.ha" } });
  }, async () => {
    const client = testClient({
      waitForSession: true,
      sessionWaitTimeoutMs: 50,
      sessionWaitIntervalMs: 1,
      onSessionWait: (event) => waitEvents.push(event),
    });
    await client.login();
  });

  expect(calls).toEqual([
    "GET /cgi-bin/login.ha",
    "GET /cgi-bin/login.ha",
    "POST /cgi-bin/login.ha",
  ]);
  expect(waitEvents).toHaveLength(1);
});

test("waitForSession stops after timeout with retry metadata", async () => {
  await withFetch(async () => htmlResponse("<title>Login</title><p>all web server sessions are in use</p>"), async () => {
    const client = testClient({
      waitForSession: true,
      sessionWaitTimeoutMs: 5,
      sessionWaitIntervalMs: 1,
    });

    try {
      await client.login();
      throw new Error("expected login to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(RouterSessionPoolFullError);
      expect((error as RouterSessionPoolFullError).waitedMs).toBe(5);
      expect((error as RouterSessionPoolFullError).retryCount).toBeGreaterThan(0);
    }
  });
});

test("bad access code does not retry as session-pool-full", async () => {
  const calls: string[] = [];
  const waitEvents: unknown[] = [];

  await withFetch(async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
    if ((init?.method ?? "GET") === "POST") return htmlResponse("<title>Login</title><p>Login Failed</p>");
    return htmlResponse(loginNonceHtml("abc123"));
  }, async () => {
    const client = testClient({
      waitForSession: true,
      sessionWaitTimeoutMs: 20,
      sessionWaitIntervalMs: 1,
      onSessionWait: (event) => waitEvents.push(event),
    });

    await expect(client.login()).rejects.toBeInstanceOf(RouterAuthError);
  });

  expect(calls).toEqual([
    "GET /cgi-bin/login.ha",
    "POST /cgi-bin/login.ha",
  ]);
  expect(waitEvents).toHaveLength(0);
});

function testClient(overrides: Partial<ConstructorParameters<typeof BGW320Client>[0]> = {}): BGW320Client {
  return new BGW320Client({
    host: "http://router.local",
    accessCode: "12345",
    timeoutMs: 1000,
    insecureTls: true,
    userAgent: "test",
    ...overrides,
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
