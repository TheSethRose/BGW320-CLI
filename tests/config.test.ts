import { expect, test } from "bun:test";
import { envDefaultOptions } from "../src/config.js";

test("envDefaultOptions reads opt-in session wait settings", () => {
  const original = snapshotEnv();
  try {
    process.env.BGW_WAIT_FOR_SESSION = "1";
    process.env.BGW_SESSION_WAIT_TIMEOUT_MS = "30000";
    process.env.BGW_SESSION_WAIT_INTERVAL_MS = "2500";

    expect(envDefaultOptions()).toMatchObject({
      waitForSession: true,
      sessionWaitTimeoutMs: 30000,
      sessionWaitIntervalMs: 2500,
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
