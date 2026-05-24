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
bgw device status --json
bgw devices --all --limit 50 --json
bgw wifi --forms --json
bgw broadband status --json
bgw broadband configure --json
bgw broadband fiber-status --json
bgw home-network status --json
bgw home-network configure --json
bgw home-network ipv6 --json
bgw home-network wi-fi --json
bgw home-network mac-filtering --json
bgw home-network subnets-dhcp --json
bgw home-network ip-allocation --json
bgw firewall status --json
bgw firewall packet-filter --json
bgw firewall nat-gaming --json
bgw firewall public-subnet-hosts --json
bgw firewall ip-passthrough --json
bgw firewall firewall-advanced --json
bgw firewall security-options --json
bgw diagnostics troubleshoot --json
bgw diagnostics speed-test --json
bgw diagnostics logs --json
bgw diagnostics syslog --json
bgw diagnostics event-notifications --json
bgw diagnostics nat-table --json
```

## Generic Inspection

```bash
bgw tabs
bgw section <section>
bgw sitemap
bgw coverage
bgw sweep --json --delay 300
bgw sweep --pages diag,wconfig_unified,dhcpserver --json
bgw sweep --include-parsed --json
bgw sweep --forms --json
bgw sweep --out router-dumps/latest
bgw page <page-or-tab> --forms --json
bgw page <page-or-tab> --raw
bgw inspect <page-or-tab> --json
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
bgw actions
bgw action <name>
bgw set <page> KEY=VALUE...
bgw submit <page> <button> [KEY=VALUE...]
bgw diagnostics ping <host> [--ipv4|--ipv6]
bgw diagnostics traceroute <host> [--ipv4|--ipv6]
bgw diagnostics nslookup <host> [--ipv4|--ipv6]
```

## Commit Patterns

Run only after explicit approval:

```bash
bgw action <name> --commit --confirm <TOKEN>
bgw set <page> KEY=VALUE --commit --confirm <TOKEN>
bgw submit <page> <button> KEY=VALUE --commit --confirm <TOKEN>
bgw diagnostics ping 1.1.1.1 --commit --confirm DIAG
```

## Session Exhaustion

Only wait for the router session pool when that exact failure mode is expected:

```bash
printf '%s' "$BGW_ACCESS_CODE" | bgw sweep --wait-for-session --access-code-stdin
printf '%s' "$BGW_ACCESS_CODE" | bgw sweep --wait-for-session --session-wait-timeout 120000 --session-wait-interval 10000 --access-code-stdin
```

Environment equivalents:

```bash
BGW_WAIT_FOR_SESSION=1
BGW_SESSION_WAIT_TIMEOUT_MS=120000
BGW_SESSION_WAIT_INTERVAL_MS=10000
```
