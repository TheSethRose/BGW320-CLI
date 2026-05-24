import { expect, test } from "bun:test";
import { envDefaultOptions } from "../src/config.js";

test("envDefaultOptions reads opt-in session wait settings", () => {
  const original = snapshotEnv();
  try {
    process.env.BGW_WAIT_FOR_SESSION = "1";
    process.env.BGW_SESSION_WAIT_TIMEOUT_MS = "30000";
    process.env.BGW_SESSION_WAIT_INTERVAL_MS = "2500";
    process.env.BGW_SESSION_CACHE_TTL_MS = "90000";
    process.env.BGW_SESSION_POOL_COOLDOWN_MS = "240000";
    process.env.BGW_SESSION_LOCK_TIMEOUT_MS = "180000";

    expect(envDefaultOptions()).toMatchObject({
      waitForSession: true,
      sessionWaitTimeoutMs: 30000,
      sessionWaitIntervalMs: 2500,
      sessionCacheTtlMs: 90000,
      sessionPoolCooldownMs: 240000,
      sessionLockTimeoutMs: 180000,
    });
  } finally {
    restoreEnv(original);
  }
});

function snapshotEnv(): Record<string, string | undefined> {
  return {
    BGW_WAIT_FOR_SESSION: process.env.BGW_WAIT_FOR_SESSION,
    BGW_SESSION_WAIT_TIMEOUT_MS: process.env.BGW_SESSION_WAIT_TIMEOUT_MS,
    BGW_SESSION_WAIT_INTERVAL_MS: process.env.BGW_SESSION_WAIT_INTERVAL_MS,
    BGW_SESSION_CACHE_TTL_MS: process.env.BGW_SESSION_CACHE_TTL_MS,
    BGW_SESSION_POOL_COOLDOWN_MS: process.env.BGW_SESSION_POOL_COOLDOWN_MS,
    BGW_SESSION_LOCK_TIMEOUT_MS: process.env.BGW_SESSION_LOCK_TIMEOUT_MS,
  };
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
