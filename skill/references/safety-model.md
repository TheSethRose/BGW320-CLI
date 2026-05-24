# Home Network Gateway CLI Safety Model

## Default Posture

Read-only first. Dry-run second. Commit only after the user approves the exact command.

## Safe Read Commands

These should not change router config:

```bash
bgw device status --json
bgw devices --all --json
bgw broadband status --json
bgw broadband fiber-status --json
bgw home-network status --json
bgw firewall status --json
bgw diagnostics logs --json
bgw sweep --json --delay 300
bgw audit --json --delay 300
```

## Sensitive Output Controls

Avoid unless explicitly requested:

```bash
--include-secrets
--raw
--out <dir>
```

Sensitive values include access codes, nonce values, serial numbers, MAC addresses, public IP addresses, SSIDs/passwords, full device lists, raw logs, and topology. `--out` writes artifacts to disk and should use ignored locations such as `router-dumps/`.

## Fixture Safety

Use `tests/fixtures` for parser and command comparisons. The generated fixture outputs are intentionally gitignored because sanitized captures can still include local device names and config shape.

Before committing any generated fixture payload, manually review for:

- Device names and hostnames
- SSIDs or Wi-Fi labels
- Serial numbers and firmware-specific identifiers
- Public IPs, MACs, IPv6 fragments, nonce/hash values
- Local topology, service mappings, logs, or family/member names

## Commit Gate

A command is not approved just because the CLI prints a token. Tokens are guardrails, not consent.

Required sequence:

1. Run dry-run.
2. Inspect payload and `commitCommand`.
3. Explain the exact change/action.
4. Get the user's explicit approval.
5. Run once.
6. Verify with read-only output.

## Dangerous Examples

Never run these without explicit approval:

```bash
bgw action restart --commit --confirm RESTART
bgw action reset-connection --commit --confirm RESET-CONNECTION
bgw action factory-reset --commit --confirm FACTORY-RESET
bgw set <page> KEY=VALUE --commit --confirm <TOKEN>
bgw submit <page> <button> KEY=VALUE --commit --confirm <TOKEN>
```
