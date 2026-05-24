# AGENTS.md - AI Coding Agent Instructions

## Project Overview

**bgw320-cli** is a TypeScript CLI tool for managing BGW320 routers via their web interface. It uses headless browser automation to interact with router pages, parse HTML forms, and execute guarded operations with confirmation tokens.

## Build & Test Commands

```bash
bun run typecheck      # TypeScript type checking
bun test               # Run tests (bun:test)
bun run lint           # ESLint for TypeScript/JS
bun run deadcode       # Knip unused files/dependencies/exports check
bun run unused-exports # ts-prune export inspection
bun run exports        # publint package publish sanity
bun run doctor         # Full local health check: typecheck, tests, lint, knip, publint
```

## Architecture

### Core Modules

| File | Purpose |
|------|----------|
| `src/cli.ts` | Main entry point, argument parsing, command routing |
| `src/client.ts` | HTTP client, router authentication, session management |
| `src/sweep.ts` | Shared traversal spine for sweep/scan/schema/audit and fixture capture |
| `src/scan.ts` | Compatibility wrapper around sweep metadata |
| `src/parser.ts` | HTML parsing utilities for forms, fields, buttons |
| `src/mutations.ts` | Build mutation plans from form state |
| `src/operations.ts` | Generate operation results (dry-run/committed) |
| `src/audit.ts` | Audit page health and classify pages |
| `src/actions.ts` | Define router actions with confirmation tokens |
| `src/diagnostics.ts` | Diagnostic operations (ping, traceroute, nslookup) |
| `src/format.ts` | Output formatting (table, JSON, key-value) |

### Router Sections

The CLI organizes router pages into 6 sections:

```typescript
type RouterSectionName =
  | "Device"
  | "Broadband"
  | "Home Network"
  | "Voice"
  | "Firewall"
  | "Diagnostics"
```

### Page Routing

Human-readable tab names resolve to CGI page IDs:

```typescript
resolvePage("Home Network/Wi-Fi")      // → "wconfig_unified"
resolvePage("Subnets & DHCP")           // → "dhcpserver"
resolvePage("Device/Status")           // → "home"
```

## Key Conventions

### 1. Dry-Run Safety

All operations are dry-run by default. Committed operations require explicit confirmation:

```bash
bgw action run-speed-test --commit --confirm SPEED
bgw set wconfig_unified ssid=Home --commit --confirm WCONFIG-UNIFIED
```

### 2. Confirmation Tokens

Each guarded page has a unique confirmation token:

- `WCONFIG-UNIFIED` → Wi-Fi settings
- `DHCP` → DHCP server
- `RESTART` → Restart device
- `SPEED` → Speed test
- `PACKETFILTER` → Packet filter

### 3. Form Parsing

Pages are parsed into structured types:

```typescript
type ParsedPage = {
  page: string;
  title: string;
  heading: string;
  values: Record<string, string>;
  tables: Record<string, string>[];
  fields: ParsedField[];
  selects: ParsedSelect[];
  textareas: ParsedTextarea[];
  buttons: ParsedButton[];
  forms: ParsedForm[];
};
```

### 4. Mutation Plans

Mutation plans include:

```typescript
type MutationPlan = {
  page: string;
  blocked: boolean;
  reason?: string;
  rawPayload: Record<string, string>;
  displayPayload: Record<string, string>;
  displayChanges: Record<string, string>;
  button?: { name: string; type: string; value: string; label: string; sensitive: boolean };
};
```

### 5. Dangerous Pages

Pages marked `dangerous: true` are blocked by default:

```typescript
const dangerousPages = ["restart", "factory-reset", "reset-connection"];
```

## Testing Patterns

### Fixture-First Router Checks

When comparing router paths, parser output, command output, page coverage, or expected page metadata, use the local sanitized fixture pack under `tests/fixtures` before hitting a live router endpoint:

- `tests/fixtures/router-html/<page>.html` for saved router HTML.
- `tests/fixtures/parsed/<page>.json` for parser output snapshots.
- `tests/fixtures/expected/<page>.json` for usefulness/redaction/discovery expectations.

Generated fixture files are gitignored because even redacted captures can expose device names, SSIDs, topology, firmware details, and config values. Do not commit generated fixture files unless they have been manually reviewed and scrubbed for public-safe content.

Only hit the live router when explicitly testing client/session behavior, when recapturing fixtures with `bun run fixtures:capture`, or when the user explicitly asks for live-router verification.

### Unit Tests

All tests use `bun:test`:

```typescript
import { expect, test } from "bun:test";
import { buildMutationPlan } from "../src/mutations.js";

test("parseAssignments parses KEY=VALUE pairs", () => {
  expect(parseAssignments(["ssid=Home", "mode=manual"])).toEqual({ ssid: "Home", mode: "manual" });
});
```

### Test Files

- `tests/actions.test.ts` - Router actions
- `tests/audit.test.ts` - Page audit classification
- `tests/cli.test.ts` - CLI command output
- `tests/devices.test.ts` - Device list parsing
- `tests/format.test.ts` - Output formatting
- `tests/mutations.test.ts` - Mutation plan generation
- `tests/operations.test.ts` - Operation result generation
- `tests/pages.test.ts` - Page routing and section mapping
- `tests/parser.test.ts` - HTML parsing utilities

## Common Patterns

### Authentication Flow

```typescript
const client = new BGW320Client({
  host: "192.168.1.254",
  accessCode: "1234",
  timeoutMs: 15000,
  insecureTls: false,
  userAgent: "bgw320-cli/0.1.0",
});
await client.login();
```

### Page Fetching

```typescript
const page = await fetchParsedPage(client, "wconfig_unified", {
  includeSecrets: false,
});
const parsed = page.parsed;
```

### Operation Submission

```typescript
const plan = buildMutationPlan("wconfig_unified", parsed, ["ssid=Home"]);
const result = submitDryRun(plan, "Save", "WCONFIG-UNIFIED");
```

## Environment Variables

```bash
BGW_HOST=192.168.1.254
BGW_ACCESS_CODE=1234
BGW_TIMEOUT_MS=15000
BGW_INSECURE_TLS=0
BGW_WAIT_FOR_SESSION=1
BGW_SESSION_WAIT_TIMEOUT_MS=120000
BGW_SESSION_WAIT_INTERVAL_MS=10000
```

## File Structure

```
src/
  actions.ts       # Router actions with confirmation tokens
  audit.ts         # Page health audit
  cli.ts           # Main CLI entry point
  client.ts        # HTTP client and authentication
  config.ts        # Configuration and options
  devices.ts       # Device list parsing
  diagnostics.ts   # Diagnostic operations
  fetch.ts         # Page fetching
  format.ts        # Output formatting
  html.ts          # HTML parsing helpers
  mutations.ts     # Mutation plan generation
  operations.ts    # Operation result generation
  pages.ts         # Page routing and section mapping
  parser.ts        # HTML parsing utilities
  redact.ts        # Secret redaction
  scan.ts          # Page scanning and discovery
  status.ts        # Router status checks
  types.ts         # TypeScript type definitions
tests/
  *.test.ts         # Unit test files
```

## Safety Guidelines

1. **Never commit without confirmation** - All mutations require `--commit --confirm TOKEN`
2. **Dangerous pages are blocked** - Restart, factory reset, connection reset are blocked by default
3. **Secrets are redacted** - Nonces and other sensitive fields are `[redacted]` in output
4. **Dry-run first** - Always review dry-run output before committing

## CLI Commands

### Read Operations (No Confirmation)

```bash
bgw device status
bgw section Device
bgw audit
bgw logs
bgw devices
```

### Guarded Operations (Require Confirmation)

```bash
bgw set wconfig_unified ssid=Home --commit --confirm WCONFIG-UNIFIED
bgw action restart --commit --confirm RESTART
bgw diagnostics ping example.com --commit --confirm DIAG
```

### Diagnostic Commands

```bash
bgw diagnostics ping example.com
bgw diagnostics traceroute example.com
bgw diagnostics nslookup example.com
```

## Output Formats

### Table Format (Default)

```
Operation: set
Page: wconfig_unified
Guarded: yes
Dangerous: no
Button: Save
Payload: {"ssid":"Home"}
```

### JSON Format

```bash
bgw set wconfig_unified ssid=Home --json
```

Returns structured JSON output for programmatic use.

## Common Pitfalls

1. **TLS validation fails** - Router uses self-signed cert. Use `--strict-tls` to enforce or `--insecure-tls` to bypass.
2. **Wrong confirmation token** - Each page has unique token. Use `bgw action <name>` to see required token.
3. **Missing access code** - Provide via `--access-code-stdin` or `BGW_ACCESS_CODE` env var.
4. **Timeout errors** - Router is slow. Increase `--timeout` or set `BGW_TIMEOUT_MS`.

## Documentation Links

- [README.md](./README.md) - Project overview and usage
- [docs/DESIGN.md](./docs/DESIGN.md) - Design system and UI guidelines
- [docs/Luxe Design.md](./docs/Luxe Design.md) - Premium design standards
