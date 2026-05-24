---
name: home-network-management
description: Troubleshoot and inspect a BGW320 home network through this repo's TypeScript/Bun gateway CLI. Use when working on read-only router status checks, device inventory, broadband/fiber/firewall/Wi-Fi diagnostics, JSON capture, sweep/audit coverage, fixture capture, dry-run router mutations, guarded commits, and safe handling of secrets or device information.
---

# Home Network Management

## Operating Context

This skill is packaged in `skill/` inside the `bgw` source checkout. Prefer the local CLI implementation and repo docs over older copied-script assumptions.

Run commands from the repository root, one directory above this skill folder:

```bash
bgw --help
```

Use `bgw ...` after global install or `bun link`. If `bgw` is not on PATH in a source checkout, run the same command through the package script, for example `bun run bgw -- --help`.

## Default Workflow

1. Read [references/safety-model.md](references/safety-model.md) before any command that could expose secrets, dump raw router output, or change router state.
2. Use read-only JSON commands first:

```bash
bgw device status --json
bgw devices --all --json
bgw broadband status --json
bgw firewall status --json
```

3. Use [references/command-map.md](references/command-map.md) when command shape is uncertain.
4. Use [references/inspection-notes.md](references/inspection-notes.md) for router quirks, fallback behavior, and what to summarize.
5. Prefer concise summaries over raw output. Device names, MACs, serials, public IPs, SSIDs, passwords, nonce values, access codes, logs, and topology should not be pasted casually.

## Auth And Environment

Prefer stdin for access codes so secrets do not land in shell history:

```bash
printf '%s' "$BGW_ACCESS_CODE" | bgw --access-code-stdin device status --json
```

For session-local automation, copy [templates/env.example](templates/env.example) into the shell environment and fill values outside the repo. Never commit real access codes.

The router web UI has a small session pool. Prefer one short burst of targeted commands over many broad sweeps. The CLI coordinates local processes with a per-router lock and short-lived session cache so repeated agent commands reuse one web session instead of logging in repeatedly.

At the end of an agent run, clear local session coordination state:

```bash
bgw session clear-cache
```

Do not invent or call a router logout endpoint unless the current fixture data or repo code proves one exists for this firmware. The checked-in BGW320 fixtures do not advertise a logout link.

## Fixture And Live-Router Rules

For parser, command-shape, page-routing, and expected metadata comparisons, use local fixture data under `tests/fixtures` before hitting the live router. Generated fixture payloads are gitignored because redacted captures can still expose device names, SSIDs, topology, firmware details, and config shape.

Only hit the live router when explicitly testing client/session behavior, recapturing fixtures with `bun run fixtures:capture`, or when the user asks for live verification.

## Mutation Rules

The CLI is intentionally conservative:

- Secrets are redacted by default.
- Read commands use GET plus the router login POST required by the web UI.
- Mutations are dry-run by default.
- Committed operations require both `--commit` and the exact `--confirm` token.
- Dangerous generic submissions are blocked.
- Router web sessions are flaky and limited, so retries need patience, not spam.
- Use `bgw session status` before repeated live checks if session-pool behavior is suspected.
- Use `bgw session clear-cache` when finished so the next run starts from a clean local coordinator state.

Default posture: read-only first, dry-run second, commit only after the user approves the exact command.
