# Router fixture pack

Generated sanitized router evidence lives here:

- `router-html/<page>.html`: sanitized raw router HTML.
- `parsed/<page>.json`: parser output for that HTML.
- `expected/<page>.json`: expected usefulness/redaction/discovery evidence.

Generated fixture files are intentionally gitignored. Keep them local unless you have manually reviewed them for device names, topology, firmware details, and config values.

Capture with:

```bash
BGW_ACCESS_CODE='<access-code>' bun run fixtures:capture
```

Recapture only specific pages:

```bash
BGW_FIXTURE_PAGES=diag,wconfig_unified BGW_ACCESS_CODE='<access-code>' bun run fixtures:capture
```

The capture is sequential and read-only: it performs GET requests plus the login POST required by the router. It redacts access-code-adjacent fields, hashes, MAC addresses, and IP addresses before writing fixtures.
