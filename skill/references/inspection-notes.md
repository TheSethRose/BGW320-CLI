# Home Network Gateway CLI Inspection Notes

These notes come from read-only inspection of the CLI behavior and router response shapes. They intentionally avoid active machine paths and sensitive values.

## CLI Behavior Observed

- Secrets are redacted by default.
- `device status` has a useful fallback when the main device page hangs.
- `devices --all` can return connected/offline inventory and can fall back to IP allocation when needed.
- `home-network status` can fall back to LAN configure, Subnets & DHCP, IP Allocation, and Wi-Fi data.
- `firewall security-options` can fall back to Firewall Status plus Firewall Advanced because some firmware returns page-not-found for the direct page.
- Generic `page` and `inspect` support form/field/button discovery.
- `sweep` is the shared traversal path for `scan`, `schema`, `audit`/`readiness`, and fixture capture.
- `audit --json` reports mapped pages, dangerous pages, failed pages, fallback pages, useful/empty pages, counts for values/tables/forms, and status codes/errors.

## Router Quirks Observed

- Web UI sessions can exhaust with: `Router reports all web server sessions are in use. Wait for a router web session to timeout, then retry.`
- Some pages can time out, especially broad status/LAN pages.
- A router may return the login page after authentication when stale sessions exist.
- `--strict-tls` is usually a bad default because the router cert is self-signed.
- Full sweeps should use a slower delay when the router is being unreliable.

## Coverage Shape Observed

The local map covers these sections:

- Device
- Broadband
- Home Network
- Voice
- Firewall
- Diagnostics

Representative pages:

```text
home, sysinfo, devices, routerpasswd, remoteaccess, restart
broadbandstatistics, broadbandconfig, fiberstat
lanstatistics, etherlan, ip6lan, wconfig_unified, wmacauth, dhcpserver, ipalloc
voice, voiceconfig, voicestat
firewall, services, packetfilter, apphosting, pshosts, ippass, dosprotect, securityoptions
diag, speed, logs, update, reset, syslog, events, nattable, sitemap
```

## Good Summary Fields

When summarizing read-only output, extract only high-signal fields:

- Model and software version
- Broadband connection source/state
- Current speed and duplex
- PON/UNI/fiber operational status
- Firewall, packet filter, NAT default server, IP passthrough posture
- Device counts rather than full device names when possible
- Audit totals, failed pages, fallback pages, dangerous pages

## Redaction Reminders

Do not casually paste:

- Access code
- Nonce values
- Serial numbers
- MAC addresses
- Public IPs
- SSIDs/passwords
- Raw logs
- Full device inventory with names
