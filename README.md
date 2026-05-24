# bgw320-cli

TypeScript/Bun CLI for the AT&T BGW320 gateway at `192.168.1.254`.

## Setup

```bash
bun install
```

## Quality Checks

```bash
bun run typecheck
bun test
bun run lint
bun run deadcode
bun run unused-exports
bun run exports
bun run doctor
```

`doctor` is the default one-command local health check for this CLI. It runs typecheck, tests, ESLint, Knip, and publint.

## Usage

```bash
bun run src/cli.ts check
bun run src/cli.ts coverage
bun run src/cli.ts sweep --pages diag,dhcpserver --json
bun run src/cli.ts audit
bun run src/cli.ts tabs
bun run src/cli.ts section Diagnostics
bun run src/cli.ts broadband fiber-status
bun run src/cli.ts home-network wi-fi --json
bun run src/cli.ts firewall nat-gaming
bun run src/cli.ts diagnostics logs --limit 50
```

Authenticated pages require the device access code. Prefer stdin so the code is not stored in shell history:

```bash
printf '<access-code>' | bun run src/cli.ts auth --access-code-stdin
printf '<access-code>' | bun run src/cli.ts wifi --access-code-stdin
```

`BGW_ACCESS_CODE` is also supported for automation.

## Commands

| Command | Purpose |
| --- | --- |
| `check` | Verify the router is reachable. |
| `auth` | Verify the access code and session login flow. |
| `tabs` | Print the CLI's router tab map. |
| `actions` | List guarded router actions and confirmation tokens. |
| `action <name>` | Dry-run a guarded router action. Requires `--commit --confirm TOKEN` to POST. |
| `section <section>` | Print mapped tabs for one router section. |
| `coverage` | Compare the CLI tab map against the live router sitemap. |
| `sweep` | Shared traversal command for mapped router pages. Default output is compact status/count metadata. |
| `scan` | Compatibility alias for compact sweep metadata. |
| `schema` | Sweep with parsed/form detail enabled. |
| `audit` / `readiness` | Sweep-backed health check that keeps going through hangs and summarizes failed/fallback/empty/useful pages. |
| `sitemap` | Print the live router sitemap. |
| `page <page-or-tab>` | Fetch and parse any mapped tab or raw CGI page ID. |
| `inspect <page-or-tab>` | Fetch a page and include parsed form fields/selects. |
| `status` | Fetch the core status pages. |
| `devices` | List connected devices. |
| `wifi` | Fetch Wi-Fi configuration with secrets redacted by default. |
| `nat` | Fetch NAT table details. |
| `logs` | Fetch router logs. |
| `set <page> KEY=VALUE...` | Build a dry-run mutation plan. Requires `--commit` to POST. |
| `submit <page> <button> KEY=VALUE...` | Build a dry-run form/button submission. Requires `--commit --confirm TOKEN` to POST. |

## Router Command Tree

All of these commands accept `--json`. Parsed page JSON includes a `summary` object with the same high-value fields used by the terminal view, plus the underlying values, tables, controls, buttons, and forms. Use `--forms` to include form controls in normal terminal output.

```bash
bun run src/cli.ts device status
bun run src/cli.ts device device-list
bun run src/cli.ts device system-information
bun run src/cli.ts device access-code
bun run src/cli.ts device remote-access
bun run src/cli.ts device restart-device

bun run src/cli.ts broadband status
bun run src/cli.ts broadband configure
bun run src/cli.ts broadband fiber-status

bun run src/cli.ts home-network status
bun run src/cli.ts home-network configure
bun run src/cli.ts home-network ipv6
bun run src/cli.ts home-network wi-fi
bun run src/cli.ts home-network mac-filtering
bun run src/cli.ts home-network subnets-dhcp
bun run src/cli.ts home-network ip-allocation

bun run src/cli.ts voice status
bun run src/cli.ts voice line-details
bun run src/cli.ts voice call-statistics

bun run src/cli.ts firewall status
bun run src/cli.ts firewall custom-services
bun run src/cli.ts firewall packet-filter
bun run src/cli.ts firewall nat-gaming
bun run src/cli.ts firewall public-subnet-hosts
bun run src/cli.ts firewall ip-passthrough
bun run src/cli.ts firewall firewall-advanced
bun run src/cli.ts firewall security-options

bun run src/cli.ts diagnostics troubleshoot
bun run src/cli.ts diagnostics ping example.com
bun run src/cli.ts diagnostics ping example.com --commit --confirm DIAG
bun run src/cli.ts diagnostics traceroute example.com --commit --confirm DIAG
bun run src/cli.ts diagnostics nslookup example.com --commit --confirm DIAG
bun run src/cli.ts diagnostics speed-test
bun run src/cli.ts diagnostics logs
bun run src/cli.ts diagnostics update
bun run src/cli.ts diagnostics resets
bun run src/cli.ts diagnostics syslog
bun run src/cli.ts diagnostics event-notifications
bun run src/cli.ts diagnostics nat-table
```

## Generic Inspection And Forms

Use `inspect` or `--forms` when the router page changed and you need to see what the CLI discovered:

```bash
bun run src/cli.ts inspect "Diagnostics/Troubleshoot" --forms
bun run src/cli.ts home-network wi-fi --forms
```

Readable page output shows available buttons and control counts by default. JSON includes parsed values, tables, fields, selects, textareas, buttons, and forms.

Several configuration pages have page-specific summaries built from current form state so default terminal output stays useful:

- `broadband configure`: source override and MTU values.
- `device access-code`, `device remote-access`, `device restart-device`: current form/action state with sensitive values redacted and restart surfaced as an explicit guarded action.
- `home-network configure`, `home-network ipv6`, `home-network wi-fi`, `home-network mac-filtering`: compact current network form state, including home/guest SSID state with passwords redacted.
- `home-network subnets-dhcp`: gateway/subnet, DHCP range, lease, public subnet, inbound, and cascaded-router state.
- `firewall packet-filter`, `firewall custom-services`, `firewall nat-gaming`, `firewall public-subnet-hosts`: current firewall/NAT form state; NAT/Gaming shows selected service/device and available service/device counts instead of dumping every dropdown option.
- `firewall ip-passthrough`: allocation mode, default server, passthrough mode/MAC, and lease.
- `firewall firewall-advanced`: ICMP, Reflexive ACL, ESP ALG, and SIP ALG toggles.
- `diagnostics update`, `diagnostics resets`, `diagnostics event-notifications`: current action/form state without requiring browser clicks.

Pages on this router can hang. Normal parsed page commands report a structured page-unavailable result instead of taking down broader workflows. `scan`, `schema`, and `audit` continue across failures so one broken AT&T page does not hide the rest of the router.

## Sweep

`sweep` is the shared traversal spine used by `scan`, `schema`, `audit`/`readiness`, and fixture capture. It uses one client/session, walks mapped pages in router-tab order, keeps going through per-page failures, and reports compact counts by default.

```bash
bun run src/cli.ts sweep
bun run src/cli.ts sweep --json
bun run src/cli.ts sweep --pages diag,wconfig_unified,dhcpserver --json
bun run src/cli.ts sweep --include-parsed --json
bun run src/cli.ts sweep --forms --json
bun run src/cli.ts sweep --out router-dumps/latest
```

Default sweep output does not dump raw HTML or full parsed payloads. Use:

- `--include-parsed` for parsed values, tables, fields, selects, textareas, buttons, forms, fallback sections, and device-list fallback data in JSON.
- `--forms` for detailed controls, buttons, forms, and submit targets.
- `--pages <csv>` to limit traversal.
- `--raw --pages <single-page>` to emit one raw HTML page.
- `--out <dir>` to write raw HTML and parsed JSON artifacts to disk while keeping stdout compact.

`scan` is retained as the compatibility command for compact sweep metadata. `schema` is sweep with parsed/form detail. `audit` and `readiness` are sweep plus the health/usefulness summary.

`device status` first tries `home.ha`. If that page hangs, it falls back to a concise summary from System Information, Broadband Status, and Firewall Status. Use the section-specific commands for deeper output such as `broadband fiber-status` or `home-network status`.

`devices` first tries `devices.ha`. If that page hangs, it falls back to `ipalloc.ha` and returns degraded device records with IP, name, MAC, status, and allocation.

`home-network status` first tries `lanstatistics.ha`. If that page hangs, it falls back to LAN configure, Subnets & DHCP, IP Allocation, and Wi-Fi configuration data.

`firewall security-options` first tries `securityoptions.ha`. On firmware that advertises that page but returns Page not found, it falls back to Firewall Status and Firewall Advanced.

The router can also refuse login when its tiny web session pool is full. By default the CLI fails fast with a clear error so normal commands do not appear hung. To wait only for that exact condition:

```bash
printf '<access-code>' | bun run src/cli.ts sweep --wait-for-session --access-code-stdin
printf '<access-code>' | bun run src/cli.ts sweep --wait-for-session --session-wait-timeout 120000 --session-wait-interval 10000 --access-code-stdin
```

Environment equivalents:

```bash
BGW_WAIT_FOR_SESSION=1
BGW_SESSION_WAIT_TIMEOUT_MS=120000
BGW_SESSION_WAIT_INTERVAL_MS=10000
```

Waiting does not retry bad access codes, random connection failures, or parser failures.

## Router Fixture Pack

Parser ground truth belongs under:

```text
tests/fixtures/router-html/<page>.html
tests/fixtures/parsed/<page>.json
tests/fixtures/expected/<page>.json
```

Generated fixture files are gitignored on purpose. They are sanitized, but they can still reveal local topology, device names, firmware behavior, and configuration shape. Keep them local unless you have manually reviewed them.

Capture sanitized fixtures from the real router with:

```bash
BGW_ACCESS_CODE='<access-code>' bun run fixtures:capture
```

The capture is sweep-backed, sequential, and read-only: it performs GET requests plus the login POST required by the router. It redacts access-code-adjacent fields, hashes, MAC addresses, and IP addresses before writing fixtures.

`tests/router-fixtures.test.ts` verifies that a complete fixture pack covers every mapped page, that parsing the saved HTML exactly matches the saved parsed JSON, and that each expected file records whether data, useful fields/tables, buttons/forms, redaction, and non-junk parsing are present.

## Diagnostics

Diagnostic network actions dry-run by default and require `--commit --confirm DIAG` to send the router form:

```bash
bun run src/cli.ts diagnostics ping example.com
bun run src/cli.ts diagnostics ping example.com --commit --confirm DIAG
bun run src/cli.ts diagnostics traceroute example.com --commit --confirm DIAG
bun run src/cli.ts diagnostics nslookup example.com --commit --confirm DIAG
```

Use `--ipv4` or `--ipv6` to set the router protocol preference.

## Safety

Read commands only send GET requests plus the login POST required for authenticated pages.

`set` defaults to dry-run. Actual POSTs require `--commit --confirm TOKEN`; the token is derived from the target CGI page, such as `WCONFIG-UNIFIED` for Wi-Fi.

`action` defaults to dry-run. Actual action POSTs require `--commit --confirm TOKEN`; run `actions` to see tokens.

`submit` defaults to dry-run. It fetches the page, discovers the requested button, builds the router POST payload from the current form state plus your overrides, and prints the confirmation token:

```bash
bun run src/cli.ts submit "Diagnostics/Troubleshoot" Ping Address=example.com
bun run src/cli.ts submit "Diagnostics/Troubleshoot" Ping Address=example.com --commit --confirm DIAG
```

Generic `submit` is blocked on dangerous pages such as restart/reset/update/access-code. Use an explicit supported `action` for those.

Dry-run JSON for `action`, `set`, `submit`, and diagnostic commands uses the same operation shape:

```json
{
  "operation": "action",
  "dryRun": true,
  "committed": false,
  "page": "speed",
  "guarded": true,
  "dangerous": false,
  "confirmation": "SPEED",
  "commitCommand": "action run-speed-test --commit --confirm SPEED",
  "payload": { "run": "Run Speed Test" }
}
```

The generic `set` command refuses mutation attempts against dangerous pages:

- `routerpasswd`
- `restart`
- `reset`
- `update`

Supported explicit actions are guarded separately. Current action commands:

```bash
bun run src/cli.ts action restart
bun run src/cli.ts action clear-device-list
bun run src/cli.ts action run-speed-test
bun run src/cli.ts action run-full-diagnostics
bun run src/cli.ts action send-diagnostics
bun run src/cli.ts action diagnostics-ethernet-details
bun run src/cli.ts action diagnostics-authentication-details
bun run src/cli.ts action diagnostics-ip-details
bun run src/cli.ts action diagnostics-dns-details
bun run src/cli.ts action packet-filter-enable
bun run src/cli.ts action packet-filter-add-drop-rule
bun run src/cli.ts action packet-filter-add-pass-rule
bun run src/cli.ts action reset-ip
bun run src/cli.ts action reset-connection
bun run src/cli.ts action restart-from-resets
bun run src/cli.ts action reset-wifi-config
bun run src/cli.ts action reset-firewall-config
bun run src/cli.ts action factory-reset
```

Every `action` command is dry-run by default. `actions` prints the confirmation token required to commit each one. Reset/restart/factory-reset actions are marked dangerous and should be treated as destructive router operations.

Sensitive values are redacted by default. Use `--include-secrets` only when intentionally inspecting local output. Debug/schema output still redacts secrets by default.

## Router Tab Coverage

`coverage` currently maps every page in the live router sitemap: Device, Broadband, Home Network, Voice, Firewall, Diagnostics, plus `sitemap` itself.

If a router page hangs or changes, use:

```bash
bun run src/cli.ts audit
bun run src/cli.ts scan --json
bun run src/cli.ts inspect "Home Network/Wi-Fi" --forms
```
