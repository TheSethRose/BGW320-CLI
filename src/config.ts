import { stdin } from "node:process";

export type GlobalOptions = {
  host: string;
  accessCode?: string | undefined;
  accessCodeStdin: boolean;
  json: boolean;
  includeSecrets: boolean;
  timeoutMs: number;
  insecureTls: boolean;
  waitForSession: boolean;
  sessionWaitTimeoutMs: number;
  sessionWaitIntervalMs: number;
  sessionCacheTtlMs: number;
  sessionPoolCooldownMs: number;
  sessionLockTimeoutMs: number;
};

export async function resolveAccessCode(options: GlobalOptions): Promise<string | undefined> {
  if (options.accessCode) return options.accessCode;
  if (process.env.BGW_ACCESS_CODE) return process.env.BGW_ACCESS_CODE;
  if (!options.accessCodeStdin) return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8").trimEnd();
}

export function envDefaultOptions(): GlobalOptions {
  return {
    host: process.env.BGW_HOST || process.env.ROUTER_IP || "192.168.1.254",
    accessCodeStdin: false,
    json: false,
    includeSecrets: false,
    timeoutMs: envNumber("BGW_TIMEOUT_MS", 15000, 1),
    insecureTls: process.env.BGW_INSECURE_TLS !== "0",
    waitForSession: process.env.BGW_WAIT_FOR_SESSION === "1",
    sessionWaitTimeoutMs: envNumber("BGW_SESSION_WAIT_TIMEOUT_MS", 120000, 0),
    sessionWaitIntervalMs: envNumber("BGW_SESSION_WAIT_INTERVAL_MS", 10000, 1),
    sessionCacheTtlMs: envNumber("BGW_SESSION_CACHE_TTL_MS", 120000, 0),
    sessionPoolCooldownMs: envNumber("BGW_SESSION_POOL_COOLDOWN_MS", 300000, 0),
    sessionLockTimeoutMs: envNumber("BGW_SESSION_LOCK_TIMEOUT_MS", 300000, 1),
  };
}

function envNumber(name: string, fallback: number, minimum: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${name} must be a finite number greater than or equal to ${minimum}.`);
  }
  return parsed;
}
