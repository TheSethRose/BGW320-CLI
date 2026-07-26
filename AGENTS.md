# AGENTS.md

## Project overview

`bgw` is a private TypeScript/Bun CLI for inspecting and managing an AT&T BGW320 gateway through its local HTTP web interface. `src/client.ts` owns HTTP transport and authentication; this project does not use browser automation.

The router has a small administrative session pool. Treat authenticated requests as scarce: use fixtures first, serialize live work through `withRouterSession`, reuse the 120-second local session cache, and preserve the five-minute session-pool cooldown.

The CLI maps 37 known endpoints across Device, Broadband, Home Network, Voice, Firewall, and Diagnostics: 36 pages from the observed sitemap plus the linked `wconfig` Advanced Wi-Fi page. The current evidence and product-guide reconciliation live in [`docs/FUNCTIONALITY_COVERAGE_REVIEW.md`](docs/FUNCTIONALITY_COVERAGE_REVIEW.md).

## Setup and validation

```bash
bun install
bun run typecheck
bun test
bun run lint
bun run deadcode
bun run unused-exports
bun run exports
bun run doctor
```

`bun run doctor` is the normal full gate: typecheck, all Bun tests, ESLint, Knip, and publint. Run focused tests while developing, then run `doctor` plus `unused-exports` before completion. Do not count skipped fixture tests as coverage.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/cli.ts` | Argument parsing, command routing, help, coordinator boundary, exit behavior |
| `src/client.ts` | Bounded HTTP transport, cookies, nonce login, redirects, response classification |
| `src/session.ts` | Per-router lock, session cache, cooldown, atomic local state |
| `src/pages.ts` | Authoritative endpoint registry, sections, aliases |
| `src/sweep.ts` | Shared sequential traversal for sweep/scan/schema/audit and fixture capture |
| `src/status.ts`, `src/devices.ts`, `src/fetch.ts` | Read workflows, typed availability, narrow fallbacks |
| `src/html.ts`, `src/parser.ts` | Generic and page-specific HTML parsing |
| `src/types.ts` | Stable parsed evidence and router data types |
| `src/format.ts` | Human and JSON output, evidence-preserving summaries |
| `src/redact.ts`, `src/fixture-sanitize.ts` | Runtime redaction and fail-closed fixture sanitization |
| `src/actions.ts`, `src/diagnostics.ts`, `src/mutations.ts`, `src/operations.ts` | Dry-run planning, explicit actions, confirmation gates, operation results |
| `src/audit.ts`, `src/scan.ts` | Audit classification and scan compatibility |
| `scripts/capture-router-fixtures.ts` | Serialized, paced, sanitized fixture capture |

Keep transport, authentication/session policy, parsing, and presentation separate. Put firmware-shape recovery in a page-specific parser only when saved evidence proves the shape; do not bury router requests in parsers or formatters.

## Parsed evidence contract

`ParsedPage` exposes:

- `values`: backward-compatible convenience map; duplicate labels collapse here.
- `valueEntries`: duplicate and blank rows with section context and optional defaults.
- `tables`: generic and page-specific structured rows.
- `fields`, `selects`, `textareas`, `buttons`: values, sensitivity, selected/checked and disabled/readonly state.
- `optionDetails`: select label/value/selected/disabled metadata.
- `forms`: method, target, and control membership names.
- `links`: label, target, optional CGI page, and link kind.

Preserve raw router evidence before adding summaries. Label locally derived data explicitly, return blank/unknown when evidence is absent, and never infer RF health, congestion, disconnect history, stable device identity, ownership, optical health, or service quality from indirect fields.

## Fixture-first workflow

Use the ignored local fixture pack before any live request:

```text
tests/fixtures/router-html/<page>.html
tests/fixtures/parsed/<page>.json
tests/fixtures/expected/<page>.json
```

The expected files are completion receipts for values, duplicate entries, tables, controls, forms, links, redaction, and useful/non-junk parsing. `tests/router-fixtures.test.ts` must reparse every mapped page exactly when the complete pack is present.

Generated fixtures are owner-only and gitignored because sanitized router evidence can still reveal names, SSIDs, topology, firmware behavior, or configuration shape. Never commit or share generated fixtures without manual privacy review.

Only use live router access for a specific question that existing source and fixtures cannot answer. Limit it to a known or already-linked GET, one process at a time, through the session coordinator. Use `BGW_FIXTURE_PAGES=<csv>` for targeted recapture; never run broad or concurrent discovery to find speculative endpoints.

## Router and session safety

- Read commands send GET requests plus the one login POST required by the gateway.
- Do not submit forms, invoke buttons, run diagnostics, change settings, restart/reset/update, clear devices, or use `--commit` without explicit approval for the exact operation.
- Never intentionally test an invalid access code.
- Prefer `--access-code-stdin`; never put real credentials in source, tests, fixtures, shell examples, process arguments, logs, or reports.
- Do not print cookies, nonce values, access codes, raw private HTML, device inventories, MAC/IP addresses, serials, SSIDs, passwords, phone/caller data, or logs casually.
- Do not run concurrent authenticated commands, sweeps, audits, schema discovery, watchdog diagnostics, or multiple `--wait-for-session` processes.
- `--wait-for-session` is opt-in and only retries the router’s exact session-pool-full condition. An active local cooldown still fails fast.
- Do not use `bgw session clear-cache` to bypass cooldown or force reauthentication. It is local-state troubleshooting and clears both cached session and cooldown under the per-router lock.
- Stop live work immediately on authentication, session-pool, timeout, or unexpected-response errors.
- Default TLS accepts the gateway’s self-signed certificate without proving router identity. Use `--strict-tls` only with an enrolled trusted/pinned certificate.

## Mutation safety

All operations are dry-run by default. Every POST requires `--commit` and the exact page/action confirmation token. Generic `set` and `submit` are blocked for dangerous pages:

```text
reset
restart
routerpasswd
update
```

Explicit actions add their own guards and may still be destructive. A printed token is a safety gate, not user authorization. Test mutation behavior only with mocks and dry-run results unless the user explicitly approves one exact live commit.

## Testing

Tests use `bun:test`. The suite is organized by concern:

- `tests/client.test.ts`, `tests/session.test.ts`, `tests/config.test.ts`: transport, auth, session pool, locks, cooldown and options.
- `tests/parser.test.ts`, `tests/devices.test.ts`, `tests/format.test.ts`: parsed evidence, redaction, inventory and output.
- `tests/pages.test.ts`, `tests/command-fixtures.test.ts`, `tests/router-fixtures.test.ts`: registry, command mapping and all-page fixture coverage.
- `tests/sweep.test.ts`, `tests/audit.test.ts`, `tests/cli.test.ts`: traversal, fallbacks, pool-stop behavior, audit and CLI safety.
- `tests/actions.test.ts`, `tests/mutations.test.ts`, `tests/operations.test.ts`: dry-run, diagnostic planning, and guarded operation contracts.
- `tests/fixture-sanitize.test.ts`: fixture privacy regression.

Add one focused regression for every parser, safety, retry, or output change. Use sanitized HTML strings or existing fixtures; tests must never authenticate to the real router.

## Common commands

```bash
bgw --help
bgw tabs
bgw page wconfig --json
bgw inspect wconfig_unified --json
bgw home-network advanced-wi-fi --json
bgw sweep --pages diag,wconfig_unified --json --delay 750
bgw session status --json
```

Broad `sweep`, `scan`, `schema`, `audit`, `readiness`, and fixture capture share the same traversal core. They are configuration-read-only but session-expensive, so prefer `--pages` and patient pacing.

## Documentation

- [`README.md`](README.md): user-facing install, commands, safety, output and fixture workflow.
- [`docs/FUNCTIONALITY_COVERAGE_REVIEW.md`](docs/FUNCTIONALITY_COVERAGE_REVIEW.md): endpoint dispositions, capability evidence and known limits.
- [`skills/network-management/SKILL.md`](skills/network-management/SKILL.md): bundled agent workflow and safety routing.
- [`skill/references/`](skill/references): command map, inspection notes and safety model.

Keep help text, README, bundled skill documentation, endpoint registry, fixture expectations, and tests synchronized when behavior changes.
