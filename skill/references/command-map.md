# Home Network Gateway CLI Command Map

## Auth And Globals

```text
--host <host>             Default: BGW_HOST, ROUTER_IP, or 192.168.1.254
--access-code-stdin       Read access code from stdin
--json                    Machine-readable output
--include-secrets         Disable redaction, only when intentional
--timeout <ms>            Default 15000
--delay <ms>              Audit/scan/sweep delay, default 150
--limit <n>               Default 20
--confirm <token>         Required for committed guarded operations
--strict-tls              Usually fails on the router cert
```

## Most-Used Read Commands

```bash
bun run src/cli.ts device status --json
bun run src/cli.ts devices --all --limit 50 --json
bun run src/cli.ts wifi --forms --json
bun run src/cli.ts broadband status --json
bun run src/cli.ts broadband configure --json
bun run src/cli.ts broadband fiber-status --json
bun run src/cli.ts home-network status --json
bun run src/cli.ts home-network configure --json
bun run src/cli.ts home-network ipv6 --json
bun run src/cli.ts home-network wi-fi --json
bun run src/cli.ts home-network mac-filtering --json
bun run src/cli.ts home-network subnets-dhcp --json
bun run src/cli.ts home-network ip-allocation --json
bun run src/cli.ts firewall status --json
bun run src/cli.ts firewall packet-filter --json
bun run src/cli.ts firewall nat-gaming --json
bun run src/cli.ts firewall public-subnet-hosts --json
bun run src/cli.ts firewall ip-passthrough --json
bun run src/cli.ts firewall firewall-advanced --json
bun run src/cli.ts firewall security-options --json
bun run src/cli.ts diagnostics troubleshoot --json
bun run src/cli.ts diagnostics speed-test --json
bun run src/cli.ts diagnostics logs --json
bun run src/cli.ts diagnostics syslog --json
bun run src/cli.ts diagnostics event-notifications --json
bun run src/cli.ts diagnostics nat-table --json
```

## Generic Inspection

```bash
bun run src/cli.ts tabs
bun run src/cli.ts section <section>
bun run src/cli.ts sitemap
bun run src/cli.ts coverage
bun run src/cli.ts sweep --json --delay 300
bun run src/cli.ts sweep --pages diag,wconfig_unified,dhcpserver --json
bun run src/cli.ts sweep --include-parsed --json
bun run src/cli.ts sweep --forms --json
bun run src/cli.ts sweep --out router-dumps/latest
bun run src/cli.ts page <page-or-tab> --forms --json
bun run src/cli.ts page <page-or-tab> --raw
bun run src/cli.ts inspect <page-or-tab> --json
```

Use `--raw` only with a single page and only when raw HTML is needed. Prefer `--out router-dumps/<name>` for local artifacts because `router-dumps/` is ignored.

## Fixture Capture

```bash
BGW_ACCESS_CODE='<access-code>' bun run fixtures:capture
BGW_FIXTURE_PAGES=diag,wconfig_unified BGW_ACCESS_CODE='<access-code>' bun run fixtures:capture
```

Fixture capture is read-only at the router-config level, but it still logs in and writes local artifacts. Generated fixture payloads are gitignored and need manual review before committing.

## Dry-Run Operations

```bash
bun run src/cli.ts actions
bun run src/cli.ts action <name>
bun run src/cli.ts set <page> KEY=VALUE...
bun run src/cli.ts submit <page> <button> [KEY=VALUE...]
bun run src/cli.ts diagnostics ping <host> [--ipv4|--ipv6]
bun run src/cli.ts diagnostics traceroute <host> [--ipv4|--ipv6]
bun run src/cli.ts diagnostics nslookup <host> [--ipv4|--ipv6]
```

## Commit Patterns

Run only after explicit approval:

```bash
bun run src/cli.ts action <name> --commit --confirm <TOKEN>
bun run src/cli.ts set <page> KEY=VALUE --commit --confirm <TOKEN>
bun run src/cli.ts submit <page> <button> KEY=VALUE --commit --confirm <TOKEN>
bun run src/cli.ts diagnostics ping 1.1.1.1 --commit --confirm DIAG
```

## Session Exhaustion

Only wait for the router session pool when that exact failure mode is expected:

```bash
printf '%s' "$BGW_ACCESS_CODE" | bun run src/cli.ts sweep --wait-for-session --access-code-stdin
printf '%s' "$BGW_ACCESS_CODE" | bun run src/cli.ts sweep --wait-for-session --session-wait-timeout 120000 --session-wait-interval 10000 --access-code-stdin
```

Environment equivalents:

```bash
BGW_WAIT_FOR_SESSION=1
BGW_SESSION_WAIT_TIMEOUT_MS=120000
BGW_SESSION_WAIT_INTERVAL_MS=10000
```
