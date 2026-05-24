import { expect, test } from "bun:test";
import { actionDryRun, diagnosticDryRun, setDryRun, submitDryRun } from "../src/operations.js";
import type { MutationPlan } from "../src/mutations.js";

const plan: MutationPlan = {
  page: "wconfig_unified",
  blocked: false,
  rawPayload: { nonce: "abc", ssid: "Home" },
  displayPayload: { nonce: "[redacted]", ssid: "Home" },
  displayChanges: { ssid: "Home" },
};

test("actionDryRun returns consistent guarded operation shape", () => {
  expect(actionDryRun({
    name: "run-speed-test",
    page: "speed",
    description: "Run speed test",
    confirmToken: "SPEED",
    payload: { run: "Run Speed Test" },
    dangerous: false,
  }, { run: "Run Speed Test" })).toEqual({
    operation: "action",
    dryRun: true,
    committed: false,
    page: "speed",
    action: "run-speed-test",
    guarded: true,
    dangerous: false,
    confirmation: "SPEED",
    commitCommand: "action run-speed-test --commit --confirm SPEED",
    payload: { run: "Run Speed Test" },
  });
});

test("setDryRun includes confirmation only for guarded pages", () => {
  expect(setDryRun(plan, "WCONFIG-UNIFIED")).toMatchObject({
    operation: "set",
    dryRun: true,
    confirmation: "WCONFIG-UNIFIED",
    commitCommand: "set wconfig_unified KEY=VALUE... --commit --confirm WCONFIG-UNIFIED",
  });

  expect(setDryRun(plan, undefined)).not.toHaveProperty("confirmation");
});

test("submitDryRun and diagnosticDryRun include commit commands", () => {
  expect(submitDryRun({
    ...plan,
    button: { name: "Enable", type: "submit", value: "Enable Packet Filters", label: "Enable Packet Filters", sensitive: false },
  }, "Enable", "PACKETFILTER")).toMatchObject({
    operation: "submit",
    button: "Enable Packet Filters",
    commitCommand: "submit wconfig_unified Enable --commit --confirm PACKETFILTER",
  });

  expect(diagnosticDryRun("ping", "example.com", { Ping: "Ping" }, "Ping")).toMatchObject({
    operation: "diagnostic",
    action: "ping",
    target: "example.com",
    confirmation: "DIAG",
    commitCommand: "diagnostics ping example.com --commit --confirm DIAG",
  });
});
