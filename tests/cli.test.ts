import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

test("help explains operation, safety, and high-value commands", () => {
  const result = spawnSync("bun", ["run", "src/cli.ts", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Auth:");
  expect(result.stdout).toContain("Most-used read commands:");
  expect(result.stdout).toContain("bgw device status");
  expect(result.stdout).toContain("bgw audit");
  expect(result.stdout).toContain("Operations are dry-run by default:");
  expect(result.stdout).toContain("Diagnostics operations:");
  expect(result.stdout).toContain("--access-code-stdin");
  expect(result.stdout).toContain("Fallbacks are intentionally narrow");
});

test("diagnostic commit requires confirmation before router access", () => {
  const result = spawnSync("bun", ["run", "src/cli.ts", "diagnostics", "ping", "example.com", "--commit"], {
    cwd: process.cwd(),
    env: { ...process.env, BGW_ACCESS_CODE: "unused" },
    encoding: "utf8",
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Re-run with --commit --confirm DIAG");
});
