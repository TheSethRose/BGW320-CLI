import type { RouterAction } from "./actions.js";
import type { DiagnosticKind } from "./diagnostics.js";
import type { MutationPlan } from "./mutations.js";

export type OperationKind = "action" | "set" | "submit" | "diagnostic";

export type OperationResult = {
  operation: OperationKind;
  dryRun: boolean;
  committed: boolean;
  page: string;
  guarded: boolean;
  dangerous: boolean;
  confirmation?: string;
  commitCommand?: string;
  action?: string;
  button?: string;
  target?: string;
  changes?: Record<string, string>;
  payload?: Record<string, string>;
  statusCode?: number;
  location?: string | null;
  result?: string;
};

export function actionDryRun(action: RouterAction, displayPayload: Record<string, string>): OperationResult {
  return {
    operation: "action",
    dryRun: true,
    committed: false,
    page: action.page,
    action: action.name,
    guarded: true,
    dangerous: action.dangerous,
    confirmation: action.confirmToken,
    commitCommand: `action ${action.name} --commit --confirm ${action.confirmToken}`,
    payload: displayPayload,
  };
}

export function actionCommitted(action: RouterAction, statusCode: number, location: string | null): OperationResult {
  return {
    operation: "action",
    dryRun: false,
    committed: true,
    page: action.page,
    action: action.name,
    guarded: true,
    dangerous: action.dangerous,
    confirmation: action.confirmToken,
    statusCode,
    location,
  };
}

export function setDryRun(plan: MutationPlan, confirmation: string | undefined): OperationResult {
  return {
    operation: "set",
    dryRun: true,
    committed: false,
    page: plan.page,
    guarded: confirmation !== undefined,
    dangerous: false,
    commitCommand: confirmation ? `set ${plan.page} KEY=VALUE... --commit --confirm ${confirmation}` : `set ${plan.page} KEY=VALUE... --commit`,
    changes: plan.displayChanges,
    payload: plan.displayPayload,
    ...(confirmation ? { confirmation } : {}),
  };
}

export function setCommitted(page: string, statusCode: number, location: string | null): OperationResult {
  return {
    operation: "set",
    dryRun: false,
    committed: true,
    page,
    guarded: true,
    dangerous: false,
    statusCode,
    location,
  };
}

export function submitDryRun(plan: MutationPlan, requestedButton: string, confirmation: string): OperationResult {
  const button = plan.button?.label ?? requestedButton;
  return {
    operation: "submit",
    dryRun: true,
    committed: false,
    page: plan.page,
    button,
    guarded: true,
    dangerous: false,
    confirmation,
    commitCommand: `submit ${plan.page} ${quoteArg(requestedButton)} --commit --confirm ${confirmation}`,
    changes: plan.displayChanges,
    payload: plan.displayPayload,
  };
}

export function submitCommitted(page: string, button: string, statusCode: number, location: string | null): OperationResult {
  return {
    operation: "submit",
    dryRun: false,
    committed: true,
    page,
    button,
    guarded: true,
    dangerous: false,
    statusCode,
    location,
  };
}

export function diagnosticDryRun(kind: DiagnosticKind, target: string, payload: Record<string, string>, button: string): OperationResult {
  return {
    operation: "diagnostic",
    dryRun: true,
    committed: false,
    page: "diag",
    action: kind,
    target,
    button,
    guarded: true,
    dangerous: false,
    confirmation: "DIAG",
    commitCommand: `diagnostics ${kind} ${quoteArg(target)} --commit --confirm DIAG`,
    payload,
  };
}

export function diagnosticCommitted(kind: DiagnosticKind, target: string, statusCode: number, result: string): OperationResult {
  return {
    operation: "diagnostic",
    dryRun: false,
    committed: true,
    page: "diag",
    action: kind,
    target,
    guarded: true,
    dangerous: false,
    statusCode,
    result,
  };
}

function quoteArg(value: string): string {
  return /^[a-z0-9_.:-]+$/i.test(value) ? value : JSON.stringify(value);
}
