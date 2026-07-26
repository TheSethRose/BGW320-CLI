import { expect, test } from "bun:test";
import { containsSensitiveFixtureValue, sanitizeRouterFixture } from "../src/fixture-sanitize.js";

test("fixture sanitizer removes values embedded in labels and router identity rows", () => {
  const sanitized = sanitizeRouterFixture(`
    <th>Network Name (SSID) Default: PrivateNetwork</th>
    <th>Password Default: private-password</th>
    <tr><th>Serial Number</th><td>device-serial</td></tr>
    <input name="WPSPIN5" value="12345670">
  `);

  expect(sanitized).not.toContain("PrivateNetwork");
  expect(sanitized).not.toContain("private-password");
  expect(sanitized).not.toContain("device-serial");
  expect(sanitized).not.toContain("12345670");
  expect(containsSensitiveFixtureValue(sanitized)).toBe(false);
});
