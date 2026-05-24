import { expect, test } from "bun:test";
import { buildMutationPlan, buildSubmitPlan, confirmTokenForPage, parseAssignments } from "../src/mutations.js";
import { buildDiagnosticPlan, diagnosticButton, extractDiagnosticResult } from "../src/diagnostics.js";
import type { ParsedPage } from "../src/types.js";

const page: ParsedPage = {
  page: "wconfig_unified",
  title: "Wi-Fi",
  heading: "Wi-Fi",
  values: {},
  tables: [],
  fields: [
    { name: "nonce", type: "hidden", value: "abc", checked: false, sensitive: true },
    { name: "enable", type: "checkbox", value: "1", checked: true, sensitive: false },
    { name: "unused", type: "checkbox", value: "1", checked: false, sensitive: false },
    { name: "Save", type: "submit", value: "Save", checked: false, sensitive: false },
  ],
  selects: [
    { name: "mode", value: "auto", options: ["auto", "manual"], sensitive: false },
  ],
  textareas: [],
  buttons: [],
  forms: [],
};

test("parseAssignments parses KEY=VALUE pairs", () => {
  expect(parseAssignments(["ssid=Home", "mode=manual"])).toEqual({ ssid: "Home", mode: "manual" });
});

test("buildMutationPlan keeps checked fields and applies changes", () => {
  const plan = buildMutationPlan("wconfig_unified", page, ["mode=manual"]);

  expect(plan.blocked).toBe(false);
  expect(plan.rawPayload).toEqual({ nonce: "abc", enable: "1", mode: "manual" });
  expect(plan.displayPayload).toEqual({ nonce: "[redacted]", enable: "1", mode: "manual" });
});

test("buildMutationPlan blocks dangerous pages", () => {
  const plan = buildMutationPlan("restart", page, ["Restart=Restart Device"]);

  expect(plan.blocked).toBe(true);
  expect(plan.reason).toContain("dangerous");
});

test("confirmTokenForPage creates stable confirmation token", () => {
  expect(confirmTokenForPage("Home Network/Wi-Fi")).toBe("WCONFIG-UNIFIED");
});

test("buildSubmitPlan adds selected button to payload", () => {
  const plan = buildSubmitPlan("diag", {
    ...page,
    buttons: [{ name: "Ping", type: "submit", value: "Ping", label: "Ping", sensitive: false }],
  }, "Ping", ["Address=example.com"]);

  expect(plan.rawPayload.Ping).toBe("Ping");
  expect(plan.rawPayload.Address).toBe("example.com");
  expect(plan.button?.name).toBe("Ping");
});

test("buildDiagnosticPlan targets diagnostic form controls", () => {
  const plan = buildDiagnosticPlan({
    ...page,
    textareas: [{ name: "ProgressWindow", value: "", sensitive: false }],
    buttons: [{ name: "Ping", type: "submit", value: "Ping", label: "Ping", sensitive: false }],
  }, "ping", "example.com", { protocol: "IPv4" });

  expect(diagnosticButton("ping")).toBe("Ping");
  expect(plan.rawPayload.WebAddress).toBe("example.com");
  expect(plan.rawPayload.protopref).toBe("IPv4");
  expect(plan.rawPayload.Ping).toBe("Ping");
});

test("extractDiagnosticResult reads progress window", () => {
  expect(extractDiagnosticResult({
    ...page,
    textareas: [{ name: "ProgressWindow", value: "pong", sensitive: false }],
  })).toBe("pong");
});
