import type { ParsedButton, ParsedPage } from "./types.js";
import { redactValue } from "./redact.js";
import { resolvePage } from "./pages.js";

export const dangerousPages = new Set([
  "reset",
  "restart",
  "routerpasswd",
  "update",
]);

export const guardedMutationPages = new Set([
  "remoteaccess",
  "broadbandconfig",
  "etherlan",
  "ip6lan",
  "wconfig_unified",
  "wmacauth",
  "dhcpserver",
  "ipalloc",
  "packetfilter",
  "apphosting",
  "pshosts",
  "ippass",
  "dosprotect",
  "securityoptions",
  "services",
  "events",
]);

const ignoredInputTypes = new Set([
  "button",
  "submit",
  "reset",
  "image",
]);

export type MutationPlan = {
  page: string;
  blocked: boolean;
  reason?: string;
  rawPayload: Record<string, string>;
  displayPayload: Record<string, string>;
  displayChanges: Record<string, string>;
  button?: ParsedButton;
};

export function buildMutationPlan(page: string, parsed: ParsedPage, assignments: string[], includeSecrets = false, options: { allowDangerousDryRun?: boolean } = {}): MutationPlan {
  page = resolvePage(page);
  const changes = parseAssignments(assignments);
  const payload = basePayload(parsed);

  for (const [name, value] of Object.entries(changes)) {
    payload[name] = value;
  }

  return planFromPayload(page, payload, changes, includeSecrets, options);
}

export function buildSubmitPlan(page: string, parsed: ParsedPage, buttonName: string, assignments: string[], includeSecrets = false): MutationPlan {
  page = resolvePage(page);
  const button = findButton(parsed, buttonName);
  if (!button) {
    throw new Error(`Button '${buttonName}' was not found on ${page}.`);
  }

  const changes = parseAssignments(assignments);
  const payload = basePayload(parsed);

  for (const [name, value] of Object.entries(changes)) {
    payload[name] = value;
  }

  if (button.name) {
    payload[button.name] = button.value || button.label || button.name;
  }

  return {
    ...planFromPayload(page, payload, changes, includeSecrets, { allowDangerousDryRun: true }),
    button,
  };
}

function findButton(parsed: ParsedPage, buttonName: string): ParsedButton | undefined {
  const target = normalize(buttonName);
  return parsed.buttons.find((button) => {
    return [button.name, button.value, button.label].some((candidate) => normalize(candidate) === target);
  });
}

function basePayload(parsed: ParsedPage): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const field of parsed.fields) {
    if (field.name === "hashpassword") continue;
    if (ignoredInputTypes.has(field.type.toLowerCase())) continue;
    if ((field.type === "checkbox" || field.type === "radio") && !field.checked) continue;
    payload[field.name] = field.value;
  }

  for (const select of parsed.selects) {
    payload[select.name] = select.value;
  }

  for (const textarea of parsed.textareas) {
    payload[textarea.name] = textarea.value;
  }

  return payload;
}

function planFromPayload(page: string, payload: Record<string, string>, changes: Record<string, string>, includeSecrets: boolean, options: { allowDangerousDryRun?: boolean }): MutationPlan {
  const safePayload = Object.fromEntries(
    Object.entries(payload).map(([name, value]) => [name, redactValue(name, value, includeSecrets)]),
  );
  const safeChanges = Object.fromEntries(
    Object.entries(changes).map(([name, value]) => [name, redactValue(name, value, includeSecrets)]),
  );

  if (dangerousPages.has(page) && options.allowDangerousDryRun !== true) {
    return {
      page,
      blocked: true,
      reason: `Refusing to mutate dangerous page '${page}'.`,
      rawPayload: payload,
      displayPayload: safePayload,
      displayChanges: safeChanges,
    };
  }

  return {
    page,
    blocked: false,
    rawPayload: payload,
    displayPayload: safePayload,
    displayChanges: safeChanges,
  };
}

export function parseAssignments(assignments: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const assignment of assignments) {
    const index = assignment.indexOf("=");
    if (index <= 0) {
      throw new Error(`Invalid assignment '${assignment}'. Use KEY=VALUE.`);
    }
    parsed[assignment.slice(0, index)] = assignment.slice(index + 1);
  }
  return parsed;
}

export function confirmTokenForPage(page: string): string {
  return resolvePage(page).toUpperCase().replace(/[^A-Z0-9]+/g, "-");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
