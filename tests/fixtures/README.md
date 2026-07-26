# Router fixture pack

Generated sanitized router evidence lives here:

- `router-html/<page>.html`: sanitized raw router HTML.
- `parsed/<page>.json`: parser output for that HTML.
- `expected/<page>.json`: expected usefulness/redaction/discovery evidence, including receipts for values, duplicate-preserving entries, tables, controls, forms, links, labels, and targets.

Generated fixture files are intentionally gitignored. Keep them local unless you have manually reviewed them for device names, topology, firmware details, and config values.

Capture with:

```bash
BGW_ACCESS_CODE='<access-code>' bun run fixtures:capture
```

Recapture only specific pages:

```bash
BGW_FIXTURE_PAGES=diag,wconfig_unified BGW_ACCESS_CODE='<access-code>' bun run fixtures:capture
```

The capture is sequential and read-only: it performs GET requests plus the login POST required by the router. It redacts access-code-adjacent fields, hashes, Wi-Fi identifiers/defaults, WPS PINs, device identifiers, serial/phone fields, MAC addresses, and IP addresses before writing owner-only fixtures. The sanitizer fails closed on recognized sensitive residue, but generated fixtures still require manual privacy review before sharing.
