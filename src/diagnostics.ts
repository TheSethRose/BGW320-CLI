import type { ParsedPage } from "./types.js";
import { buildSubmitPlan, type MutationPlan } from "./mutations.js";

export type DiagnosticKind = "ping" | "traceroute" | "nslookup";

export type DiagnosticPlan = {
  kind: DiagnosticKind;
  target: string;
  dryRun: boolean;
  page: string;
  payload: Record<string, string>;
  button: string;
};

const diagnosticButtons: Record<DiagnosticKind, string> = {
  ping: "Ping",
  traceroute: "Trace",
  nslookup: "Lookup",
};

export function isDiagnosticKind(value: string | undefined): value is DiagnosticKind {
  return value === "ping" || value === "traceroute" || value === "nslookup";
}

export function buildDiagnosticPlan(parsed: ParsedPage, kind: DiagnosticKind, target: string, options: { protocol?: "IPv4" | "IPv6" | undefined; includeSecrets?: boolean } = {}): MutationPlan {
  const assignments = [`WebAddress=${target}`];
  if (options.protocol) assignments.push(`protopref=${options.protocol}`);
  return buildSubmitPlan("diag", parsed, diagnosticButtons[kind], assignments, options.includeSecrets === true);
}

export function diagnosticButton(kind: DiagnosticKind): string {
  return diagnosticButtons[kind];
}

export function extractDiagnosticResult(parsed: ParsedPage): string {
  const progress = parsed.textareas.find((textarea) => textarea.name === "ProgressWindow")?.value;
  if (progress) return progress;
  return parsed.values["Field ProgressWindow"] ?? "";
}
