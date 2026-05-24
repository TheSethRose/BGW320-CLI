#!/usr/bin/env bun
import { BGW320Client, RouterAuthError, RouterConnectionError, RouterSessionPoolFullError } from "./client.js";
import { envDefaultOptions, resolveAccessCode, type GlobalOptions } from "./config.js";
import { parsedPageOutput, printAudit, printCompositeStatus, printDeviceList, printDeviceStatus, printJson, printKeyValues, printLogs, printOperation, printPageFetchError, printParsedPage, printScans, printSitemap } from "./format.js";
import { parseLogs, parsePage, parseSitemap } from "./parser.js";
import { buildMutationPlan, buildSubmitPlan, confirmTokenForPage, dangerousPages, guardedMutationPages } from "./mutations.js";
import { listSections, resolvePage, resolveSectionCommand, routerTabs, tabsForSection } from "./pages.js";
import { displayActionPayload, getAction, routerActions } from "./actions.js";
import { buildDiagnosticPlan, diagnosticButton, extractDiagnosticResult, isDiagnosticKind } from "./diagnostics.js";
import { fetchParsedPage } from "./fetch.js";
import { fetchDeviceStatus, fetchHomeNetworkStatus, fetchSecurityOptions, fetchStatusSections } from "./status.js";
import { buildAudit } from "./audit.js";
import { fetchDeviceList } from "./devices.js";
import { actionCommitted, actionDryRun, diagnosticCommitted, diagnosticDryRun, setCommitted, setDryRun, submitCommitted, submitDryRun } from "./operations.js";
import { clearSessionState, readSessionState, routerSessionIdentity, withRouterSession } from "./session.js";
import { stripLargePayloads, sweepRouter, writeSweepArtifacts, type SweepPage } from "./sweep.js";

type Command = {
  name: string;
  args: string[];
  options: GlobalOptions & {
    raw: boolean;
    forms: boolean;
    all: boolean;
    commit: boolean;
    full: boolean;
    confirm: string | undefined;
    protocol: "IPv4" | "IPv6" | undefined;
    delayMs: number;
    limit: number;
    includeParsed: boolean;
    pages: string[] | undefined;
    outDir: string | undefined;
  };
};

async function main(argv: string[]): Promise<void> {
  const command = parseArgs(argv);

  if (command.name === "help" || command.name === "--help" || command.name === "-h") {
    printHelp();
    return;
  }

  const accessCode = await resolveAccessCode(command.options);
  const client = new BGW320Client({
    host: command.options.host,
    accessCode,
    timeoutMs: command.options.timeoutMs,
    insecureTls: command.options.insecureTls,
    userAgent: "bgw/0.1.0",
    waitForSession: command.options.waitForSession,
    sessionWaitTimeoutMs: command.options.sessionWaitTimeoutMs,
    sessionWaitIntervalMs: command.options.sessionWaitIntervalMs,
    onSessionWait: command.options.json ? undefined : (event) => {
      const totalRetries = Math.max(1, Math.ceil(event.timeoutMs / Math.max(1, event.intervalMs)));
      process.stderr.write(`Router web session pool is full; waiting ${event.intervalMs}ms before retry ${event.retryCount + 1} of approximately ${totalRetries}.\n`);
    },
  });

  if (!usesSessionCoordinator(command)) {
    await runCommand(client, command);
    return;
  }

  await withRouterSession(client, {
    cacheTtlMs: command.options.sessionCacheTtlMs,
    poolCooldownMs: command.options.sessionPoolCooldownMs,
    lockTimeoutMs: command.options.sessionLockTimeoutMs,
    waitForSession: command.options.waitForSession,
  }, () => runCommand(client, command));
}

async function runCommand(client: BGW320Client, command: Command): Promise<void> {
  switch (command.name) {
    case "check": {
      const result = await client.check();
      output(command, result, () => printKeyValues({
        Host: result.host,
        Reachable: result.reachable ? "yes" : "no",
        Title: result.title,
      }));
      return;
    }

    case "auth": {
      await client.login();
      output(command, { authenticated: true }, () => process.stdout.write("authenticated\n"));
      return;
    }

    case "sitemap": {
      const html = (await client.getCgiPage("sitemap", { auth: false })).body;
      const entries = parseSitemap(html);
      output(command, entries, () => printSitemap(entries));
      return;
    }

    case "coverage": {
      const html = (await client.getCgiPage("sitemap", { auth: false })).body;
      const livePages = [...new Set(parseSitemap(html).map((entry) => entry.page))].sort();
      const mappedPages = [...new Set(routerTabs.map((tab) => tab.page))].sort();
      const result = {
        mappedCount: mappedPages.length,
        liveCount: livePages.length,
        missingFromCli: livePages.filter((page) => !mappedPages.includes(page)),
        notInLiveSitemap: mappedPages.filter((page) => !livePages.includes(page)),
      };
      output(command, result, () => {
        printKeyValues({
          "Mapped pages": String(result.mappedCount),
          "Live sitemap pages": String(result.liveCount),
          "Missing from CLI": result.missingFromCli.join(", ") || "(none)",
          "Not in live sitemap": result.notInLiveSitemap.join(", ") || "(none)",
        });
      });
      return;
    }

    case "tabs": {
      output(command, routerTabs, () => printTabs(routerTabs));
      return;
    }

    case "actions": {
      output(command, routerActions, () => {
        for (const action of routerActions) {
          const guard = action.dangerous ? "dangerous" : "guarded";
          process.stdout.write(`${action.name.padEnd(30)} ${action.page.padEnd(12)} ${guard.padEnd(9)} confirm=${action.confirmToken.padEnd(21)} ${action.description}\n`);
        }
      });
      return;
    }

    case "session": {
      const action = command.args[0] ?? "status";
      const origin = routerSessionIdentity(command.options.host);
      if (action === "status") {
        const state = await readSessionState(origin);
        output(command, state, () => printKeyValues({
          "Cached session": state.cached ? "yes" : "no",
          "Cache expires": state.cacheExpiresAt ? new Date(state.cacheExpiresAt).toISOString() : "(none)",
          "Pool cooldown until": state.poolCooldownUntil ? new Date(state.poolCooldownUntil).toISOString() : "(none)",
        }));
        return;
      }
      if (action === "clear-cache") {
        await clearSessionState(origin);
        output(command, { ok: true, cleared: true }, () => process.stdout.write("session cache cleared\n"));
        return;
      }
      throw new Error(`Unknown session command: ${action}`);
    }

    case "action": {
      const name = requireArg(command, "action name");
      const action = getAction(name);
      if (!action) throw new Error(`Unknown action: ${name}`);
      const payload = displayActionPayload(action, command.options.includeSecrets);

      if (!command.options.commit) {
        const result = actionDryRun(action, payload);
        output(command, result, () => printOperation(result));
        return;
      }

      if (command.options.confirm !== action.confirmToken) {
        throw new Error(`Refusing to run action '${action.name}'. Re-run with --commit --confirm ${action.confirmToken}.`);
      }

      const response = await client.postCgiPage(action.page, action.payload);
      const result = actionCommitted(action, response.statusCode, String(response.headers.location ?? "") || null);
      output(command, result, () => printOperation(result));
      return;
    }

    case "sweep":
    case "scan":
    case "schema": {
      const scans = await runSweepCommand(client, command);
      if (command.options.raw && !command.options.outDir && !command.options.json) return;
      output(command, scans, () => printScans(scans));
      return;
    }

    case "audit":
    case "readiness": {
      const scans = await runSweepCommand(client, command, { forceCompact: true });
      const audit = buildAudit(scans);
      output(command, audit, () => printAudit(audit));
      return;
    }

    case "section": {
      const section = requireArg(command, "section name");
      const tabs = tabsForSection(section);
      if (tabs.length === 0) throw new Error(`Unknown section: ${section}`);
      output(command, tabs, () => printTabs(tabs));
      return;
    }

    case "diagnostics": {
      const maybeKind = command.args[0];
      if (isDiagnosticKind(maybeKind)) {
        const target = command.args[1];
        if (!target) throw new Error(`Missing target for diagnostics ${maybeKind}.`);
        if (command.options.commit && command.options.confirm !== "DIAG") {
          throw new Error(`Refusing to run diagnostic '${maybeKind}'. Re-run with --commit --confirm DIAG.`);
        }

        const diagPage = await fetchParsedPage(client, "diag", { includeSecrets: true });
        if (!diagPage.ok || !diagPage.parsed) {
          process.exitCode = 2;
          output(command, diagPage, () => printPageFetchError(diagPage));
          return;
        }
        const parsed = diagPage.parsed;
        const plan = buildDiagnosticPlan(parsed, maybeKind, target, {
          protocol: command.options.protocol,
          includeSecrets: command.options.includeSecrets,
        });

        if (!command.options.commit) {
          const result = diagnosticDryRun(maybeKind, target, plan.displayPayload, diagnosticButton(maybeKind));
          output(command, result, () => printOperation(result));
          return;
        }

        const response = await client.postCgiPage("diag", plan.rawPayload);
        const resultPage = parsePage("diag", response.body, { includeSecrets: command.options.includeSecrets });
        const result = extractDiagnosticResult(resultPage);
        const operation = diagnosticCommitted(maybeKind, target, response.statusCode, result || `Router returned status ${response.statusCode}; no progress output found.`);
        output(command, { ...operation, pageResult: parsedPageOutput(resultPage) }, () => printOperation(operation));
        return;
      }

      const tab = resolveSectionCommand(command.name, command.args);
      if (tab) {
        await printPageCommand(client, command, tab.page, { forms: command.options.forms });
        return;
      }
      throw new Error(`Unknown diagnostics command: ${command.args.join(" ") || "(none)"}`);
    }

    case "page":
    case "inspect": {
      const page = resolvePage(command.args.join(" ") || requireArg(command, "page name"));
      await printPageCommand(client, command, page, { forms: command.name === "inspect" || command.options.forms });
      return;
    }

    case "devices": {
      await printPageCommand(client, command, "devices", { forms: command.options.forms });
      return;
    }

    case "wifi": {
      await printPageCommand(client, command, "wconfig_unified", { forms: command.options.forms });
      return;
    }

    case "nat": {
      await printPageCommand(client, command, "nattable", { forms: command.options.forms });
      return;
    }

    case "logs": {
      await printPageCommand(client, command, "logs", { forms: command.options.forms });
      return;
    }

    case "set": {
      const page = resolvePage(requireArg(command, "page name"));
      const assignments = command.args.slice(1);
      if (assignments.length === 0) throw new Error("Missing KEY=VALUE assignment.");
      const pageResult = await fetchParsedPage(client, page, { includeSecrets: true });
      if (!pageResult.ok || !pageResult.parsed) {
        process.exitCode = 2;
        output(command, pageResult, () => printPageFetchError(pageResult));
        return;
      }
      const parsed = pageResult.parsed;
      const plan = buildMutationPlan(page, parsed, assignments, command.options.includeSecrets);

      if (plan.blocked) {
        throw new Error(plan.reason ?? "Mutation blocked.");
      }

      if (!command.options.commit) {
        const token = guardedMutationPages.has(page) ? confirmTokenForPage(page) : undefined;
        const result = setDryRun(plan, token);
        output(command, result, () => printOperation(result));
        return;
      }

      if (dangerousPages.has(page)) {
        throw new Error(`Refusing to mutate dangerous page '${page}'. Use an explicit action command if supported.`);
      }

      if (guardedMutationPages.has(page) && command.options.confirm !== confirmTokenForPage(page)) {
        throw new Error(`Refusing to commit changes to '${page}'. Re-run with --commit --confirm ${confirmTokenForPage(page)}.`);
      }

      const response = await client.postCgiPage(page, plan.rawPayload);
      const result = setCommitted(page, response.statusCode, String(response.headers.location ?? "") || null);
      output(command, result, () => printOperation(result));
      return;
    }

    case "submit": {
      const page = resolvePage(requireArg(command, "page name"));
      const button = command.args[1];
      if (!button) throw new Error("Missing button name.");
      const assignments = command.args.slice(2);
      const pageResult = await fetchParsedPage(client, page, { includeSecrets: true });
      if (!pageResult.ok || !pageResult.parsed) {
        process.exitCode = 2;
        output(command, pageResult, () => printPageFetchError(pageResult));
        return;
      }
      const parsed = pageResult.parsed;
      const plan = buildSubmitPlan(page, parsed, button, assignments, command.options.includeSecrets);
      const token = confirmTokenForPage(page);

      if (!command.options.commit) {
        const result = submitDryRun(plan, button, token);
        output(command, result, () => printOperation(result));
        return;
      }

      if (dangerousPages.has(page)) {
        throw new Error(`Refusing generic submit on dangerous page '${page}'. Use an explicit action command if supported.`);
      }

      if (command.options.confirm !== token) {
        throw new Error(`Refusing to submit '${button}' on '${page}'. Re-run with --commit --confirm ${token}.`);
      }

      const response = await client.postCgiPage(page, plan.rawPayload);
      const result = submitCommitted(page, button, response.statusCode, String(response.headers.location ?? "") || null);
      output(command, result, () => printOperation(result));
      return;
    }

    case "status": {
      const result = await fetchStatusSections(client, { includeSecrets: command.options.includeSecrets });
      output(command, result, () => {
        for (const section of result) {
          process.stdout.write(`\n${section.title || section.heading || section.page}\n`);
          if (!section.ok) {
            process.stdout.write(`${section.error ?? "unavailable"}\n`);
            continue;
          }
          printKeyValues(section.values);
        }
      });
      return;
    }

    default:
      {
        const tab = resolveSectionCommand(command.name, command.args);
        if (tab) {
          await printPageCommand(client, command, tab.page, { forms: command.options.forms });
          return;
        }
      }
      throw new Error(`Unknown command: ${command.name}\nRun bgw help.`);
  }
}

function usesSessionCoordinator(command: Command): boolean {
  return !["actions", "coverage", "section", "session", "sitemap", "tabs"].includes(command.name);
}

async function printPageCommand(client: BGW320Client, command: Command, page: string, options: { forms: boolean }): Promise<void> {
  if (page === "home" && !command.options.raw) {
    const status = await fetchDeviceStatus(client, { includeSecrets: command.options.includeSecrets });
    output(command, status, () => printDeviceStatus(status, { limit: command.options.limit }));
    return;
  }

  if (page === "lanstatistics" && !command.options.raw) {
    const status = await fetchHomeNetworkStatus(client, { includeSecrets: command.options.includeSecrets });
    output(command, status, () => printCompositeStatus("Home Network Status", status, { limit: command.options.limit }));
    return;
  }

  if (page === "securityoptions" && !command.options.raw) {
    const status = await fetchSecurityOptions(client, { includeSecrets: command.options.includeSecrets });
    output(command, status, () => printCompositeStatus("Security Options", status, { limit: command.options.limit }));
    return;
  }

  if (command.options.raw) {
    const response = await client.getCgiPage(page);
    process.stdout.write(response.body);
    return;
  }

  if (page === "devices") {
    const result = await fetchDeviceList(client, { includeOffline: command.options.all });
    output(command, result, () => printDeviceList(result, { limit: command.options.limit }));
    return;
  }

  if (page === "logs") {
    const response = await fetchRawPage(client, command, page);
    if (!response) return;
    const logs = parseLogs(response.body).slice(0, command.options.limit);
    output(command, logs, () => printLogs(logs));
    return;
  }

  const result = await fetchParsedPage(client, page, { includeSecrets: command.options.includeSecrets });
  if (!result.ok || !result.parsed) {
    process.exitCode = 2;
    output(command, result, () => printPageFetchError(result));
    return;
  }

  output(command, parsedPageOutput(result.parsed), () => printParsedPage(result.parsed!, { forms: options.forms, limit: command.options.limit }));
}

async function runSweepCommand(client: BGW320Client, command: Command, options: { forceCompact?: boolean } = {}): Promise<SweepPage[]> {
  const limitedPages = command.options.pages;
  if (command.options.raw && !command.options.outDir && (!limitedPages || limitedPages.length !== 1)) {
    throw new Error("Refusing to emit raw HTML for a full sweep. Use --pages <page> with exactly one page, or use --out <dir>.");
  }

  const writeArtifacts = command.options.outDir !== undefined;
  const includeParsed = !options.forceCompact && (command.options.includeParsed || command.options.full || command.name === "schema" || writeArtifacts);
  const includeForms = !options.forceCompact && (command.options.forms || command.name === "schema");
  const includeRaw = !options.forceCompact && (command.options.raw || writeArtifacts);
  const pages = await sweepRouter(client, {
    delayMs: command.options.delayMs,
    pages: limitedPages,
    includeParsed,
    includeForms,
    includeRaw,
    includeSecrets: command.options.includeSecrets,
    useFallbacks: !includeRaw,
    onPageProgress: command.options.json ? undefined : (event) => {
      if (event.phase === "start") {
        process.stderr.write(`sweep ${event.index}/${event.total} ${event.page} start\n`);
        return;
      }
      process.stderr.write(`sweep ${event.index}/${event.total} ${event.page} ${event.status ?? "failed"}\n`);
    },
  });

  if (command.options.raw && !writeArtifacts && !command.options.json) {
    process.stdout.write(pages[0]?.rawHtml ?? "");
    return [];
  }

  if (writeArtifacts) {
    return writeSweepArtifacts(pages, command.options.outDir!);
  }

  return includeParsed || includeForms || includeRaw ? pages : pages.map(stripLargePayloads);
}

async function fetchRawPage(client: BGW320Client, command: Command, page: string): Promise<{ body: string } | undefined> {
  try {
    return await client.getCgiPage(page);
  } catch (error) {
    if (error instanceof RouterAuthError) throw error;
    const result = {
      page,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    process.exitCode = 2;
    output(command, result, () => printPageFetchError(result));
    return undefined;
  }
}

function parseArgs(argv: string[]): Command {
  const options = {
    ...envDefaultOptions(),
    raw: false,
    forms: false,
    all: false,
    commit: false,
    full: false,
    confirm: undefined as string | undefined,
    protocol: undefined as "IPv4" | "IPv6" | undefined,
    delayMs: 150,
    limit: 20,
    includeParsed: false,
    pages: undefined as string[] | undefined,
    outDir: undefined as string | undefined,
  };

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    switch (arg) {
      case "--host":
        options.host = requireValue(argv, ++i, "--host");
        break;
      case "--access-code-stdin":
        options.accessCodeStdin = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--include-secrets":
        options.includeSecrets = true;
        break;
      case "--timeout":
        options.timeoutMs = Number(requireValue(argv, ++i, "--timeout"));
        break;
      case "--strict-tls":
        options.insecureTls = false;
        break;
      case "--raw":
        options.raw = true;
        break;
      case "--forms":
        options.forms = true;
        break;
      case "--all":
        options.all = true;
        break;
      case "--commit":
        options.commit = true;
        break;
      case "--confirm":
        options.confirm = requireValue(argv, ++i, "--confirm");
        break;
      case "--ipv4":
        options.protocol = "IPv4";
        break;
      case "--ipv6":
        options.protocol = "IPv6";
        break;
      case "--full":
        options.full = true;
        break;
      case "--include-parsed":
        options.includeParsed = true;
        break;
      case "--pages":
        options.pages = requireValue(argv, ++i, "--pages").split(",").map((page) => page.trim()).filter(Boolean);
        break;
      case "--out":
        options.outDir = requireValue(argv, ++i, "--out");
        break;
      case "--delay":
        options.delayMs = Number(requireValue(argv, ++i, "--delay"));
        break;
      case "--limit":
        options.limit = Number(requireValue(argv, ++i, "--limit"));
        break;
      case "--wait-for-session":
        options.waitForSession = true;
        break;
      case "--session-wait-timeout":
        options.sessionWaitTimeoutMs = Number(requireValue(argv, ++i, "--session-wait-timeout"));
        break;
      case "--session-wait-interval":
        options.sessionWaitIntervalMs = Number(requireValue(argv, ++i, "--session-wait-interval"));
        break;
      default:
        positional.push(arg);
    }
  }

  return {
    name: positional[0] ?? "help",
    args: positional.slice(1),
    options,
  };
}

function output(command: Command, value: unknown, tablePrinter: () => void): void {
  if (command.options.json) {
    printJson(value);
    return;
  }
  tablePrinter();
}

function requireArg(command: Command, name: string): string {
  const value = command.args[0];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new Error(`Missing value for ${flag}.`);
  return value;
}

function printHelp(): void {
  process.stdout.write(`bgw

Auth:
  Set BGW_ACCESS_CODE for automation, or pass --access-code-stdin to read it from stdin.
  Secrets are redacted by default. Use --include-secrets only for intentional local inspection.

Most-used read commands:
  bgw device status
    Concise gateway overview. If home.ha hangs, falls back to System Information,
    Broadband Status, and Firewall Status without touching flaky LAN/Fiber pages.

  bgw devices [--all] [--limit 20]
    Connected device list. Falls back to IP Allocation if devices.ha hangs.

  bgw wifi [--forms] [--json]
    Wi-Fi configuration and controls. Passwords/keys stay redacted by default.

  bgw broadband status | configure | fiber-status
    Broadband link details, editable broadband config, or optical/fiber module data.

  bgw home-network status | configure | ipv6 | wi-fi | mac-filtering | subnets-dhcp | ip-allocation
    LAN, IPv6, Wi-Fi, MAC filtering, DHCP/subnet, and IP allocation surfaces.

  bgw firewall status | packet-filter | nat-gaming | public-subnet-hosts | ip-passthrough | firewall-advanced | security-options
    Firewall status/config pages. security-options falls back to Firewall Status
    plus Firewall Advanced on firmware where securityoptions.ha returns Page not found.

  bgw diagnostics troubleshoot | speed-test | logs | update | resets | syslog | event-notifications | nat-table
    Diagnostics pages, speed-test history, logs, firmware/update/reset/syslog/event/NAT views.

Generic inspection:
  bgw page <page-or-tab> [--forms] [--raw] [--json]
    Fetch any tab or CGI page. Use --raw for router HTML.

  bgw inspect <page-or-tab> [--json]
    Same as page --forms: includes fields, selects, buttons, forms, and submit targets.

  bgw tabs | section <section> | sitemap | coverage
    Show the local tab map, one section, live sitemap, or sitemap-vs-CLI coverage.

  bgw session status | clear-cache
    Inspect or clear local session coordination state. clear-cache does not call
    an unverified router logout endpoint.

  bgw sweep [--json] [--pages diag,dhcpserver] [--include-parsed] [--forms] [--out router-dumps/latest]
    Shared traversal command for every mapped tab. Default output is compact
    status/count metadata. Full parsed payloads, form details, raw HTML, and
    artifact writing are opt-in.

  bgw scan [--json]
    Compatibility alias for compact sweep metadata.

  bgw schema [--json]
    Sweep with parsed/form detail enabled.

  bgw audit [--json] [--delay 150]
    Sweep-backed health check across every mapped tab. Keeps going through hangs
    and reports failed/fallback/empty/useful pages.

Operations are dry-run by default:
  bgw actions
    List explicit guarded actions and their confirmation tokens.

  bgw action <name>
    Show the payload and required commit command. Does not POST.
    Example: bgw action run-speed-test

  bgw action <name> --commit --confirm TOKEN
    POST an explicit action only after the confirmation token matches.
    Examples:
      bgw action run-speed-test --commit --confirm SPEED
      bgw action restart --commit --confirm RESTART

  bgw set <page> KEY=VALUE...
    Build a dry-run config mutation from current form state plus overrides.
    Commit requires --commit --confirm TOKEN for guarded pages.

  bgw submit <page> <button> [KEY=VALUE...]
    Dry-run a discovered router button/form submit. Generic submit is blocked on
    dangerous pages such as restart/reset/update/access-code.

Diagnostics operations:
  bgw diagnostics ping <host> [--ipv4|--ipv6]
  bgw diagnostics traceroute <host> [--ipv4|--ipv6]
  bgw diagnostics nslookup <host> [--ipv4|--ipv6]
    Dry-run diagnostic form submissions.

  bgw diagnostics ping <host> --commit --confirm DIAG
    Actually send the diagnostic request. traceroute/nslookup use the same DIAG token.

Global options:
  --host <host>             Router host. Default: BGW_HOST, ROUTER_IP, or 192.168.1.254
  --access-code-stdin       Read the device access code from stdin
  --json                    Print script-friendly JSON
  --include-secrets         Include sensitive local output instead of redacting it
  --include-parsed          Include full parsed page data in sweep/schema JSON
  --pages <csv>             Limit sweep/scan/schema/audit traversal to selected pages
  --out <dir>               Write sweep raw HTML and parsed JSON artifacts to disk
  --timeout <ms>            Request timeout. Default: 15000
  --delay <ms>              Delay between audit/scan requests. Default: 150
  --limit <n>               Limit displayed rows. Default: 20
  --wait-for-session        Wait/retry when the router says all web sessions are in use
  --session-wait-timeout <ms>   Wait timeout. Default: 120000
  --session-wait-interval <ms>  Wait poll interval. Default: 10000
  --confirm <token>         Required token for committed guarded operations
  --strict-tls              Enforce TLS validation. Usually fails on the router cert.

Notes:
  Read commands only perform GET requests plus the login POST required by the router.
  The router web UI is flaky. Fallbacks are intentionally narrow so normal commands stay fast.
  Session-pool waiting is opt-in so basic commands do not appear hung. Env:
  BGW_WAIT_FOR_SESSION=1, BGW_SESSION_WAIT_TIMEOUT_MS, BGW_SESSION_WAIT_INTERVAL_MS.
  Agent bursts reuse a short-lived local router session cache under a per-host
  lock to avoid filling the web session pool. Env:
  BGW_SESSION_CACHE_TTL_MS, BGW_SESSION_POOL_COOLDOWN_MS, BGW_SESSION_LOCK_TIMEOUT_MS.
  JSON dry-runs include operation, dryRun, committed, page, guarded, dangerous,
  confirmation, commitCommand, payload, and changes/result fields where applicable.

Sections: ${listSections().join(", ")}
`);
}

function printTabs(tabs: typeof routerTabs): void {
  const sectionWidth = Math.max(7, ...tabs.map((tab) => tab.section.length));
  const labelWidth = Math.max(5, ...tabs.map((tab) => tab.label.length));
  for (const tab of tabs) {
    const danger = tab.dangerous ? "  guarded" : "";
    process.stdout.write(`${tab.section.padEnd(sectionWidth)}  ${tab.label.padEnd(labelWidth)}  ${tab.page}${danger}\n`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof RouterSessionPoolFullError) {
    if (process.argv.slice(2).includes("--json")) {
      printJson({
        ok: false,
        page: "login",
        error: "Router web session pool is full.",
        sessionPoolFull: true,
        waitedMs: error.waitedMs,
        retryCount: error.retryCount,
      });
    } else {
      process.stderr.write(`${error.message}\n`);
    }
    process.exit(2);
  }
  if (error instanceof RouterAuthError || error instanceof RouterConnectionError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
