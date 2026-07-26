# BGW320 CLI functionality and data-coverage review

Review date: 2026-07-26  
Observed gateway family: AT&T BGW320-505  
Scope: current repository, 37-page sanitized fixture pack, existing read-only review and saved evidence, one targeted read-only GET to the already-linked `wconfig.ha` endpoint, and the Nokia BGW320-505 Product Guide.

## Executive conclusion

The CLI now maps every page in the observed sitemap plus the linked Advanced Wi-Fi endpoint and preserves every generally useful data surface represented by the current fixture pack: unique convenience values, duplicate and blank value rows, structured tables, fields, select labels and state, textareas, buttons, forms, links, and disabled/readonly metadata. Page-specific parsing now recovers data that the generic parser previously lost on Wi-Fi, Ethernet, fiber, MAC-filter, and voice pages.

The current local registry contains 37 endpoints: 36 observed sitemap pages and `wconfig`, which is linked from the router UI but was absent from the sitemap. Sanitized fixtures prove usable content for 34 endpoints. `home` and `lanstatistics` have captured timeout receipts, while `securityoptions` has a captured unavailable/page-not-found receipt; all three have narrow CLI fallbacks and remain explicit failures in fixture metadata.

No router configuration form, button, diagnostic, channel-selection operation, WPS operation, restart, reset, update, or committed command was invoked during this work. The only new router request was one serialized authenticated GET to the already-linked `wconfig.ha` page. Its response was sanitized into the local ignored fixture pack, the unsanitized temporary response was deleted, and no further live access was used.

The remaining data gaps are primarily firmware/interface limits. The observed local UI does not expose Wi-Fi client RSSI, noise, retries, roaming/association/disconnect history, FEC/FCS counters, per-port live Ethernet state, IGMP state, VLAN/802.1p state, QoS/classification state, URL filters, LED state, or local OMCI/TR-069 state. The product guide proves that some of those capabilities exist in hardware or the platform; it does not prove that AT&T exposes them through this firmware’s local web interface.

## Evidence model

| Label | Meaning in this report |
| --- | --- |
| Router-reported | Present in a sanitized fixture or the targeted read-only response. |
| Locally derived | Computed only from router-reported fields, with the derivation disclosed. |
| Heuristic | A useful but uncertain classification. No new heuristic conclusions were added. |
| Hardware capability only | Described by the product guide without an observed local management surface. |
| Remotely managed only | The guide assigns the capability to OMCI/TR-069 or another remote plane, with no observed local page. |
| Not exposed by observed firmware | Searched across the current saved pages, controls, links, scripts, comments, and parsed data without finding the metric. |
| Unknown | Existing evidence is insufficient; a specific future sanitized response would be required. |

Visible controls are evidence that an operation exists, but they are not evidence that it is safe, successful, or read-only. All buttons on configuration, diagnostic, restart, reset, update, firewall, device-blocking, and radio pages remain modeled as controls only.

## Implemented coverage gaps

| Gap | Implementation | Evidence and regression receipt | Router-request effect |
| --- | --- | --- | --- |
| Linked Advanced Wi-Fi page was absent from the registry | Added `Home Network/Advanced Wi-Fi` → `wconfig`, aliases, command-tree routing, help, README, skill docs, and fixture-backed command coverage. | Targeted read-only GET, sanitized `wconfig` fixture, `tests/pages.test.ts`, `tests/command-fixtures.test.ts`. | Adds one GET only when that page is explicitly requested or included in a broad traversal; broad map grows from 36 to 37 pages. |
| Current Wi-Fi channels and widths were dropped | Added page-specific channel rows with radio, channel, width, and selection mode. Two reported 5 GHz channels are labeled low/high by channel range. | Existing `wconfig_unified` fixture and parser/formatter regressions. | No added request; parses the existing response. |
| Advanced Wi-Fi controls were present but unmodeled | Added structured radio and SSID rows for enablement, standards, configured bandwidth/channel, power, hidden state, security, WPA, WPS, and maximum clients. | Targeted `wconfig` fixture plus parser and command-fixture tests. | No secondary request. |
| Duplicate labels, blank values, and embedded defaults were lost | Added `valueEntries` with section, label, value, and optional default while retaining the existing `values` convenience map for compatibility. | All 37 parsed fixtures and parser regression tests. | No request change. |
| Select labels and control state were incomplete | Added option label/value/selected/disabled metadata and disabled/readonly state for fields, selects, textareas, and buttons. | Parser tests and all fixture receipts. | No request change. |
| Page links were discarded | Added typed links with label, href, optional CGI page, and router-page/external/other classification. | Parser tests and all fixture link receipts. | No request change; no linked page is followed automatically. |
| Ethernet output mixed current configuration with every option | Added one row per observed port with configured media/MDI-X and separately labeled supported modes. | Existing `etherlan` fixture and parser regression. | No request change. Live link state/speed remains unavailable. |
| MAC-filter state lacked radio/network identity | Added separate 2.4 GHz private, 2.4 GHz guest, and 5 GHz private rows where observed. | Existing `wmacauth` fixture and parser regression. | No request change. |
| Fiber threshold rows lost the measurement name | Added measurement-labeled current/state/low/high rows for temperature, voltage, bias, transmit power, and receive power. | Existing `fiberstat` fixture and parser regression. | No request change. No optical-health inference added. |
| Voice tables lost most multirow-header data | Added status/line-detail parsing and complete last-call, cumulative, summary, and since-reset statistic rows. | Existing `voice`, `voiceconfig`, and `voicestat` fixtures plus parser regression. | No request change. |
| Caller/phone data needed metric-aware redaction | Extended sensitive-name handling for phone and caller fields. | Parser/fixture redaction tests. | No request change; lowers disclosure risk. |
| Fixture sanitizer missed text defaults and WPS variants | Centralized capture sanitization, added SSID/password defaults, WPS suffixes, identity rows, device names, and fail-closed checks. | `tests/fixture-sanitize.test.ts`; all sanitized fixture outputs revalidated. | No router-request change. |
| Sweep receipts omitted preserved entries and links | Added `valueEntryCount` and `linkCount` to compact sweep data and terminal output; expected fixtures now record labels and link targets. | `tests/sweep.test.ts` and `tests/router-fixtures.test.ts`. | No request change. |
| Human/docs output lagged JSON coverage | Added current radio rows, Advanced Wi-Fi summaries, complete voice tables, form metadata, link/value details, help text, README, fixture docs, and bundled skill guidance. | Formatter, CLI-help, and documentation inspection. | No request change. |

## Endpoint disposition

Every endpoint below is registered in `src/pages.ts`, has HTML/parsed/expected fixture receipts, and is covered by `tests/router-fixtures.test.ts`. “Captured” means the saved sanitized response contains usable observed-firmware evidence. It does not mean that any visible operation was executed.

| Section | Page | Endpoint | Disposition |
| --- | --- | --- | --- |
| Device | Status | `home` | Captured timeout; direct page unavailable in saved evidence. CLI falls back to `sysinfo`, `broadbandstatistics`, and `firewall`. |
| Device | Device List | `devices` | Captured inventory, raw gateway status/name/address/connection/last-activity fields, IPv6/lifetime/speed fields where present, controls and links. No disconnect or identity inference. |
| Device | System Information | `sysinfo` | Captured model, software/platform identifiers and other displayed status values. |
| Device | Access Code | `routerpasswd` | Captured redacted form/control metadata. Mutating controls only; no submission performed. |
| Device | Remote Access | `remoteaccess` | Captured current form state and controls. This is local remote-access configuration, not proof of OMCI/TR-069 state. |
| Device | Restart Device | `restart` | Captured mutating controls only. Loading the page is read-only; restart controls were not invoked. |
| Broadband | Status | `broadbandstatistics` | Captured broadband/link addressing/status/counter values displayed by firmware. |
| Broadband | Configure | `broadbandconfig` | Captured current form state and supported selections. Mutating controls were not invoked. |
| Broadband | Fiber Status | `fiberstat` | Captured PON/UNI/module state, optical measurements, environmental values, and labeled alarm thresholds. Raw units preserved. |
| Home Network | Status | `lanstatistics` | Captured timeout; no live retry. CLI falls back to `etherlan`, `dhcpserver`, `ipalloc`, and `wconfig_unified`. |
| Home Network | Configure | `etherlan` | Captured LAN configuration and four per-port configured/supported media and MDI-X rows. No live per-port link state or negotiated speed. |
| Home Network | IPv6 | `ip6lan` | Captured IPv6 LAN/DHCPv6/router-advertisement configuration fields and controls. |
| Home Network | Wi-Fi | `wconfig_unified` | Captured SSID/security/isolation state and router-reported current channel/width/mode rows. Mutating channel-selection controls remain controls only. |
| Home Network | Advanced Wi-Fi | `wconfig` | Captured through one targeted linked GET. Structured 2.4 GHz and combined 5 GHz radio/SSID controls; no RF telemetry or secondary data request. |
| Home Network | MAC Filtering | `wmacauth` | Captured per-radio/network filter state and form controls. Does not prove ACL enforcement outcomes. |
| Home Network | Subnets & DHCP | `dhcpserver` | Captured private/public subnet, DHCP range/lease, inbound and cascaded-router configuration fields. |
| Home Network | IP Allocation | `ipalloc` | Captured allocation table and per-device action controls. Controls were not invoked. |
| Voice | Status | `voice` | Captured router-reported two-line status metrics with sensitive phone/caller values redacted. |
| Voice | Line Details | `voiceconfig` | Captured line-detail metrics and controls with sensitive values redacted. |
| Voice | Call Statistics | `voicestat` | Captured complete per-line, summary, and cumulative call-statistic tables. |
| Firewall | Status | `firewall` | Captured router-reported firewall posture values. |
| Firewall | Custom Services | `services` | Captured service definitions and form controls. Mutating controls were not invoked. |
| Firewall | Packet Filter | `packetfilter` | Captured enablement/form controls. No rule or enable/disable control was invoked. |
| Firewall | NAT/Gaming | `apphosting` | Captured current selected service/device and available options without dumping names in summaries. |
| Firewall | Public Subnet Hosts | `pshosts` | Captured displayed state and controls. |
| Firewall | IP Passthrough | `ippass` | Captured allocation/default-server/passthrough/MAC/lease state. |
| Firewall | Firewall Advanced | `dosprotect` | Captured ICMP, reflexive ACL, ESP ALG, SIP ALG, and related selections. |
| Firewall | Security Options | `securityoptions` | Captured unavailable/page-not-found response; CLI falls back to `firewall` and `dosprotect`. |
| Diagnostics | Troubleshoot | `diag` | Captured status/detail tables, target/protocol inputs, progress textarea, buttons and form target. All diagnostic buttons remain dry-run unless explicitly committed. |
| Diagnostics | Speed Test | `speed` | Captured saved history and mutating run control. No speed test was run. |
| Diagnostics | Logs | `logs` | Captured router log rows and controls; output remains sensitive. |
| Diagnostics | Update | `update` | Captured update form/control metadata only. No update action was invoked. |
| Diagnostics | Resets | `reset` | Captured reset controls only. No reset action was invoked. |
| Diagnostics | Syslog | `syslog` | Captured current syslog configuration and controls. |
| Diagnostics | Event Notifications | `events` | Captured event-notification form state and controls. |
| Diagnostics | NAT Table | `nattable` | Captured NAT session totals, display selection, and session rows. |
| Diagnostics | Site Map | `sitemap` | Captured 36 observed sitemap page links plus other navigation links. Used as the known-page authority, not as an endpoint-discovery crawler. |

No saved page contained a JavaScript `fetch`/XHR call, embedded JSON data service, or secondary read endpoint that exposed additional RF, device-history, Ethernet-state, or product-guide metrics. No speculative endpoint was added or probed.

## Product-guide capability reconciliation

| Product-guide capability | Observed local evidence | Classification and closure |
| --- | --- | --- |
| Three 10/100/1000 Ethernet ports plus one 100M/1G/2.5G/5G port | Four port configuration selectors and supported media options on `etherlan`; guide supplies physical port capabilities. | Router-reported configuration plus hardware capability. Actual negotiated speed/link/duplex per port is not exposed in usable saved evidence because `lanstatistics` timed out. |
| Ethernet negotiation, duplex, link state, speed and per-port state | Configured media/MDI-X options are available; broadband status has WAN-side link fields. | LAN live state remains unknown/not exposed by observed usable pages. Supported configuration must not be presented as current negotiation. |
| 2.4 GHz, 5 GHz low-band and 5 GHz high-band Wi-Fi | Unified page reports one 2.4 GHz channel and two 5 GHz channels; guide confirms tri-band hardware. | Channels are router-reported. Low/high labels are locally derived from channel ranges. Advanced 5 GHz configuration is combined in observed firmware. |
| Multiple private/public SSIDs | Private and guest SSID controls are observed. | Router-reported. “Public” hotspot/service SSID state beyond the displayed guest/private controls is not observed. |
| Channel, width, automatic/manual selection and advanced radio configuration | Current channel/width/mode on `wconfig_unified`; standards, configured bandwidth/channel, power and controls on `wconfig`. | Available and exposed. Selection buttons and save/update actions are mutating and were not invoked. |
| Wi-Fi standards, security modes and WPS state | Advanced select/field metadata exposes standards, security, WPA, and WPS state/options. | Router-reported current configuration and available controls. WPS operation safety is not inferred. |
| SFP+ and optical status | `fiberstat` exposes module/PON/UNI status and optical/environmental fields; guide describes the SFP+ platform. | Router-reported status plus hardware capability. Physical module capabilities not shown locally remain guide-only. |
| Optical receive level/RSSI | Receive and transmit power appear in `fiberstat` with thresholds. | Router-reported optical evidence. It is not Wi-Fi RSSI, and the CLI makes no optical-health conclusion. |
| FEC and FCS counters | No explicit field found in fixtures, scripts, comments, controls, broadband tables, fiber tables, or diagnostics pages. | Hardware/platform capability only; not exposed by observed firmware. Generic errors/collisions are not relabeled as FEC/FCS. |
| Performance monitoring and alarms | Broadband counters, optical current values, and optical alarm thresholds are observed. | Partially exposed. The full platform performance/alarm subsystem described by the guide is not locally visible. |
| POTS and SIP voice status | Voice status and line-detail pages expose two-line state/metrics. | Router-reported. The CLI does not claim end-to-end call quality. |
| Caller ID, waiting, hold, transfer and voice feature state | Caller-related fields and call statistics are observed; the guide describes supported call services. | Caller/call evidence is router-reported and redacted. Waiting/hold/transfer provisioning or behavior is hardware/service capability only unless a future page exposes explicit state. |
| DHCP client/server | DHCP server/subnet configuration is observed; broadband pages expose assigned addressing/status. | Partially router-reported. No unsupported client lease internals are invented. |
| DNS client/server | Broadband/diagnostic forms expose DNS-related addressing and lookup controls where present. | Partially router-reported. Running DNS diagnostics is mutating/active and remains opt-in committed behavior. No separate local DNS-server database is observed. |
| NAT/NAPT | NAT table, NAT/Gaming, IP passthrough and public-subnet surfaces are observed. | Router-reported state and controls. Session rows do not establish application identity or service quality. |
| IGMP snooping/proxy | No explicit field or control found. | Hardware/platform capability only or remotely managed; not exposed by observed firmware. |
| VLAN tagging, 802.1p and per-port routed mode | No explicit local state found in usable fixtures. | Hardware/platform or remote-management capability only. Ethernet configuration options are not relabeled as VLAN/priority state. |
| Traffic classification and QoS | No explicit classifier, queue, priority or QoS state found. | Hardware/platform or remotely managed only; not exposed by observed firmware. |
| Firewall, ACL, IP/MAC/URL filters | Firewall posture, packet filters, reflexive ACL/ALG controls, NAT, passthrough and Wi-Fi MAC filtering are observed. | IP/MAC/firewall/ACL surfaces are router-reported. No explicit URL-filter surface was observed. |
| TR-069, OMCI, software image and remote-management state | Update/software and local remote-access configuration pages are observed. No explicit OMCI/TR-069 session/state page is present. | Software version/update controls are router-reported. OMCI/TR-069 management is guide-described remote management only. |
| Hardware model, memory, software, uptime and environment/health | Model/software/status values appear on system/broadband pages; fiber environment values are observed. | Partially router-reported. Guide memory capacity is hardware-only; no general memory-usage or complete environmental-health page is observed. |
| Service LED state or software equivalent | No LED-state field found. | Guide-described hardware behavior only; not exposed by observed firmware. |

## Wi-Fi observability closure

| Metric | Disposition |
| --- | --- |
| SSIDs | Available and exposed; redacted in fixtures where sensitive. |
| Enabled/disabled state | Available and exposed. |
| Security/WPA/WPS state | Available and exposed on observed configuration controls. |
| Guest isolation/access | Available and exposed. |
| Current channel numbers | Available and exposed from the unified page. |
| Current channel width | Available and exposed from the unified page. |
| Low/high 5 GHz identity | Locally derived from two router-reported channel ranges and corroborated by guide hardware capability. |
| Configured standard/bandwidth/channel/power/max clients/hidden state | Available through the linked Advanced Wi-Fi endpoint and exposed. |
| Per-client RSSI | Not exposed by observed firmware. |
| Noise floor | Not exposed by observed firmware. |
| Retry/retransmission counts | Not exposed by observed firmware. |
| Association/roaming/disconnect history | Not exposed by observed firmware. |
| Per-radio health or congestion | Unsupported conclusion; underlying evidence is absent. |

The parser does not infer RF quality, congestion, channel recommendation, interference, or disconnect causality. “Find Best Channel,” WPS, update, and save controls are represented as mutating controls only.

## Device-inventory closure

The CLI preserves gateway-reported status, name, IPv4, MAC, connection type, connection speed, allocation, last activity, mesh flag, IPv6 addresses, device type, and IPv6 lifetimes when those fields appear. `devices --all` controls whether offline/remembered rows are retained, and the fallback to IP Allocation is explicitly degraded.

The observed inventory does not provide a trustworthy stale threshold, disconnect log, name provenance, stable identity across private MAC rotation, ownership, or a reliable mapping from IPv4/IPv6/MAC aliases to one physical person/device. The CLI therefore does not:

- infer a disconnect from `last activity`;
- classify remembered rows as stale from an undocumented timestamp threshold;
- claim that router-generated names are user-assigned or accurate;
- merge changing private MAC addresses;
- claim that an IP or hostname establishes ownership;
- infer Wi-Fi signal or connection quality.

Adding any of those conclusions requires a new observed field, a documented router contract, or a clearly labeled user-supplied identity layer. It is not safe to fabricate them from the current inventory.

## Data-surface closure

The parsed JSON contract in `src/types.ts` now has an evidence-preserving and a convenience layer:

- `values` remains the backward-compatible last-value-by-label map.
- `valueEntries` preserves duplicates, blanks, section context, and embedded defaults.
- `tables` preserves generic tables and page-specific recovered structures.
- `fields`, `selects`, `textareas`, and `buttons` preserve value/state/sensitivity metadata.
- `optionDetails` preserves option label, value, selected state, and disabled state.
- `forms` preserves method, action, and control membership names.
- `links` preserves link label, target, CGI page identity, and kind.

The current 37-page expected fixture set records 232 convenience values, 1,037 preserved value entries, 817 structured table rows, 98 fields, 59 selects, one textarea, 224 buttons, 27 forms, and 530 links. These counts are completion receipts for the current sanitized evidence, not stable public constants; firmware changes may change them.

Generic parsing remains intentionally conservative. It returns blank/unknown evidence rather than guessing when headers, units, status semantics, or identity are absent. Page-specific parsers exist only where the current fixtures prove the HTML shape and the generic parser demonstrably loses meaning.

## CLI command and workflow receipts

| Surface | Receipt |
| --- | --- |
| `help` | Documents read commands, Advanced Wi-Fi, voice, generic inspection metadata, broad traversal risk, dry-run operations and global options; covered by `tests/cli.test.ts`. |
| `check` | Unauthenticated reachability/title check; client tests cover transport behavior. |
| `auth` | Explicit authenticated login check through the shared session coordinator. |
| `tabs`, `section` | Registry inspection; all 37 mappings and aliases covered by page tests. |
| `sitemap`, `coverage` | Unauthenticated known-page comparison; `coverage` reports linked pages outside the sitemap rather than inventing missing endpoints. |
| `session status`, `session clear-cache` | Local coordination state; status is router-free, clear-cache is serialized and documented as explicit troubleshooting only. |
| `page`, `inspect` | Generic page read and full parsed/form evidence. Raw IDs remain supported without speculative discovery. |
| `status`, `device ...`, `devices` | Direct and narrow fallback status/inventory workflows; fixture and mock coverage. |
| `wifi`, `home-network wi-fi`, `home-network advanced-wi-fi` | Basic and advanced Wi-Fi reads with redaction and radio/config structures. |
| `broadband ...` | Status, configuration-state and fiber/optical reads. |
| `voice ...` | Status, line details and complete call statistics. |
| `firewall ...`, `nat` | Status, services, filters, NAT, passthrough, public-subnet, ACL/ALG and fallback surfaces. |
| `logs`, `diagnostics ...` read subcommands | Saved logs/history/configuration pages. Ping/traceroute/nslookup remain dry-run until explicit commit. |
| `sweep`, `scan`, `schema`, `audit`, `readiness` | One serialized traversal spine, selected-page support, pacing, pool-full stop, compact/full receipts and artifacts. |
| `actions`, `action`, `set`, `submit` | Dry-run by default; every POST requires confirmation and dangerous generic pages remain blocked. Mutating paths are tested only with mocks/static command checks. |
| Fixture capture | Uses the shared session coordinator, bounded pacing, targeted page support, sanitizer, owner-only files and exact parsed/expected receipts. |

## Source and artifact receipts

| File or group | Completion receipt |
| --- | --- |
| `src/cli.ts` | Every registered command, alias, coordinator boundary, output path and help workflow inspected; Advanced Wi-Fi/voice/help coverage updated. |
| `src/client.ts` | GET/login/POST classification, nonce, cookies, redirect/body bounds and typed router errors inspected; prior read-only review remediation remains covered by client tests. |
| `src/config.ts` | Environment/default/credential-stdin and numeric option behavior inspected; tests cover validation. |
| `src/session.ts` | Cache, cooldown, per-router lock, stale lock, atomic state and clear-cache behavior inspected; session tests cover concurrency/cooldown paths. |
| `src/fetch.ts`, `src/status.ts`, `src/devices.ts` | Page availability, narrow fallbacks, authentication propagation and device evidence inspected; fixture/mock tests cover behavior. |
| `src/pages.ts`, `src/scan.ts`, `src/sweep.ts`, `src/audit.ts` | Registry, compatibility wrapper, shared traversal and audit metadata inspected; 37-page and pool-stop receipts pass. |
| `src/html.ts`, `src/parser.ts`, `src/types.ts`, `src/redact.ts` | HTML primitives, generic/page-specific parsing, evidence model and redaction inspected; every observed page reparses exactly. |
| `src/format.ts` | JSON and human summaries inspected; useful page-specific data remains visible without unsupported conclusions. |
| `src/actions.ts`, `src/diagnostics.ts`, `src/mutations.ts`, `src/operations.ts` | Dry-run/commit guards, payload construction, explicit actions and operation results inspected; no live mutation tests used. |
| `src/fixture-sanitize.ts`, `scripts/capture-router-fixtures.ts` | Sanitization, fail-closed validation, sequential capture, file modes and metadata receipts inspected and tested. |
| `tests/actions.test.ts`, `tests/mutations.test.ts`, `tests/operations.test.ts` | Guarded operation and dry-run contracts. |
| `tests/client.test.ts`, `tests/session.test.ts`, `tests/config.test.ts` | Transport/auth/session/error and option safety. |
| `tests/parser.test.ts`, `tests/devices.test.ts`, `tests/format.test.ts` | Generic/page-specific parsing, inventory preservation, redaction and human output. |
| `tests/pages.test.ts`, `tests/command-fixtures.test.ts`, `tests/router-fixtures.test.ts` | Registry/command/fixture completeness for all 37 pages. |
| `tests/sweep.test.ts`, `tests/audit.test.ts`, `tests/cli.test.ts` | Shared traversal, pool-full stop, compact metadata, audit and help/early safety gates. |
| `tests/fixture-sanitize.test.ts`, `tests/fixtures/README.md` | Capture privacy regression and local fixture handling contract. |
| `README.md`, `skill/SKILL.md`, `skill/references/*.md`, `skill/templates/env.example`, `skill/agents/openai.yaml` | User and agent workflows reconciled with the current registry, evidence limits, session safety and output model. |
| `package.json`, `bun.lock`, `tsconfig.json`, `eslint.config.js`, `knip.json` | Build/test/dependency/type/lint/dead-code/package-validation configuration included in the offline validation gates. |
| `AGENTS.md` | Repository safety, fixture-first, dry-run and validation instructions followed. |

## Explicit deferrals and limitations

| Item | Closure and technical reason | Request/session effect if later implemented |
| --- | --- | --- |
| Three failed page receipts | `home` and `lanstatistics` timed out; `securityoptions` was unavailable. Existing narrow fallbacks supply partial data. Re-fetching them solely for this review would add session risk without a specific unanswered field. | A future targeted recapture costs one GET per page and should stop on the first router/session error. |
| Form-scoped generic payload model | Controls are still flattened at page level for generic mutation planning. Correctly versioning form ownership changes parsed JSON and mutation semantics and requires sanitized multi-form evidence. It is outside safe data-read coverage and remains documented residual risk. | No additional reads once fixture evidence exists; lowers mutation risk. |
| Stable public error-code taxonomy | Typed internal errors and safe stopping exist, but a versioned JSON error schema remains a public-interface design task rather than a data-coverage gap. | No extra requests; could discourage unsafe retries. |
| Certificate/public-key pinning | Default self-signed TLS does not authenticate router identity. A safe default requires an enrollment/pinning workflow; enabling strict TLS unconditionally would break this gateway. | No extra router requests after enrollment. |
| Request memoization across fallbacks | Some broad fallback pages can be fetched again later in the same sweep. A shared response cache needs explicit freshness semantics. Broad work is already serialized and paced. | Would reduce broad traversal GETs and session load. |
| Watchdog | No watchdog exists in this repository. Adding an outage state machine is a separate subsystem, not a missing parser or router data surface. | Must use unauthenticated healthy checks and bounded transition-only authenticated diagnostics. |
| Unknown HTTP-200 firmware error shapes | Known login, session-pool, page-not-found and HTTP error paths are classified. Unknown future firmware error HTML needs a sanitized example before adding a signature. | In-band classification should add no requests. |
| Generated fixture privacy | Heuristic sanitization is substantially stronger and fails on recognized residue, but generated router HTML is not automatically public-safe. Manual review remains mandatory. | No normal router-request effect. |

## Validation receipt

All required offline gates passed against the completed worktree with the full 37-page local fixture pack present:

| Command | Result |
| --- | --- |
| `bun run typecheck` | Passed. |
| `bun test` | Passed: 121 tests across 16 files, 1,071 expectations, zero failures. |
| `bun run lint` | Passed. |
| `bun run deadcode` | Passed with no Knip findings. |
| `bun run unused-exports` | Passed with no findings. |
| `bun run exports` | Passed publint package validation. |
| `bun run doctor` | Passed the combined typecheck, complete tests, lint, Knip, and publint sequence. |

No fixture test was skipped: all 37 HTML, parsed JSON, and expected metadata sets were present and reparsed exactly. Validation was entirely offline and did not authenticate to or send requests to the router.
