import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BGW320Client, RouterSessionPoolFullError } from "./client.js";
import type { RouterSessionSnapshot } from "./types.js";

type CachedSession = RouterSessionSnapshot & {
  version: 1;
  cachedAt: number;
  expiresAt: number;
};

type SessionPoolCooldown = {
  version: 1;
  origin: string;
  until: number;
  waitedMs: number;
  retryCount: number;
};

export type SessionCoordinatorOptions = {
  cacheTtlMs: number;
  poolCooldownMs: number;
  lockTimeoutMs: number;
  waitForSession: boolean;
};

export type SessionState = {
  cached: boolean;
  cacheExpiresAt?: number | undefined;
  poolCooldownUntil?: number | undefined;
};

export async function withRouterSession<T>(
  client: BGW320Client,
  options: SessionCoordinatorOptions,
  run: () => Promise<T>,
): Promise<T> {
  const paths = sessionPaths(client.sessionIdentity());
  await mkdir(dirname(paths.cache), { recursive: true });
  const release = await acquireLock(paths.lock, options.lockTimeoutMs);
  try {
    await applyCooldown(paths.cooldown, options.waitForSession);
    const cached = await readJson<CachedSession>(paths.cache);
    if (cached && cached.expiresAt > Date.now()) {
      client.importSession(cached);
    }

    const result = await run();
    if (containsSessionPoolFull(result)) {
      await rememberSessionPoolFull(paths, new RouterSessionPoolFullError(), options.poolCooldownMs);
      client.clearSession();
      return result;
    }

    if (client.hasAuthenticatedSession()) {
      await writeJson(paths.cache, {
        ...client.exportSession(),
        version: 1,
        cachedAt: Date.now(),
        expiresAt: Date.now() + Math.max(0, options.cacheTtlMs),
      } satisfies CachedSession);
      await rm(paths.cooldown, { force: true });
    }
    return result;
  } catch (error) {
    if (error instanceof RouterSessionPoolFullError) {
      await rememberSessionPoolFull(paths, error, options.poolCooldownMs);
      client.clearSession();
    }
    throw error;
  } finally {
    await release();
  }
}

export async function readSessionState(origin: string): Promise<SessionState> {
  const paths = sessionPaths(origin);
  const cached = await readJson<CachedSession>(paths.cache);
  const cooldown = await readJson<SessionPoolCooldown>(paths.cooldown);
  const now = Date.now();
  return {
    cached: Boolean(cached && cached.expiresAt > now),
    ...(cached && cached.expiresAt > now ? { cacheExpiresAt: cached.expiresAt } : {}),
    ...(cooldown && cooldown.until > now ? { poolCooldownUntil: cooldown.until } : {}),
  };
}

export async function clearSessionState(origin: string): Promise<void> {
  const paths = sessionPaths(origin);
  await Promise.all([
    rm(paths.cache, { force: true }),
    rm(paths.cooldown, { force: true }),
  ]);
}

export function routerSessionIdentity(host: string): string {
  const cleanHost = host.replace(/\/+$/, "");
  return new URL(/^https?:\/\//i.test(cleanHost) ? cleanHost : `https://${cleanHost}`).origin;
}

async function applyCooldown(path: string, waitForSession: boolean): Promise<void> {
  if (waitForSession) {
    await rm(path, { force: true });
    return;
  }

  const cooldown = await readJson<SessionPoolCooldown>(path);
  if (!cooldown) return;
  if (cooldown.until <= Date.now()) {
    await rm(path, { force: true });
    return;
  }

  throw new RouterSessionPoolFullError("Router web session pool is full; local cooldown is active.", {
    waitedMs: cooldown.waitedMs,
    retryCount: cooldown.retryCount,
  });
}

async function rememberSessionPoolFull(
  paths: ReturnType<typeof sessionPaths>,
  error: RouterSessionPoolFullError,
  poolCooldownMs = 300000,
): Promise<void> {
  await Promise.all([
    rm(paths.cache, { force: true }),
    writeJson(paths.cooldown, {
      version: 1,
      origin: paths.origin,
      until: Date.now() + Math.max(0, poolCooldownMs),
      waitedMs: error.waitedMs,
      retryCount: error.retryCount,
    } satisfies SessionPoolCooldown),
  ]);
}

function containsSessionPoolFull(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if ("sessionPoolFull" in value && value.sessionPoolFull === true) return true;
  if (Array.isArray(value)) return value.some(containsSessionPoolFull);
  return false;
}

function sessionPaths(origin: string): { origin: string; cache: string; cooldown: string; lock: string } {
  const key = createHash("sha256").update(origin).digest("hex").slice(0, 24);
  const root = process.env.BGW_SESSION_CACHE_DIR || join(process.env.XDG_CACHE_HOME || join(homedir() || tmpdir(), ".cache"), "bgw");
  return {
    origin,
    cache: join(root, `${key}.session.json`),
    cooldown: join(root, `${key}.cooldown.json`),
    lock: join(root, `${key}.lock`),
  };
}

async function acquireLock(path: string, timeoutMs: number): Promise<() => Promise<void>> {
  const startedAt = Date.now();
  const staleMs = Number(process.env.BGW_SESSION_LOCK_STALE_MS || 900000);

  while (true) {
    try {
      const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      await handle.close();
      return async () => {
        await rm(path, { force: true });
      };
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      await removeStaleLock(path, staleMs);
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error("Timed out waiting for local router session lock.", { cause: error });
      }
      await sleep(100);
    }
  }
}

async function removeStaleLock(path: string, staleMs: number): Promise<void> {
  try {
    const info = await stat(path);
    if (Date.now() - info.mtimeMs > staleMs) {
      await rm(path, { force: true });
    }
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
