import { expect, test } from "bun:test";
import { looksLikeLogin, parseDevices, parsePage, parseSitemap } from "../src/parser.js";

test("parseSitemap extracts CGI page names and labels", () => {
  const entries = parseSitemap(`
    <a href="/cgi-bin/sysinfo.ha">System Information</a>
    <a href="https://192.168.1.254/cgi-bin/wconfig_unified.ha">Wi-Fi Configure</a>
  `);

  expect(entries).toEqual([
    { page: "sysinfo", label: "System Information", href: "/cgi-bin/sysinfo.ha" },
    { page: "wconfig_unified", label: "Wi-Fi Configure", href: "https://192.168.1.254/cgi-bin/wconfig_unified.ha" },
  ]);
});

test("parsePage redacts sensitive values by default", () => {
  const parsed = parsePage("wifi", `
    <title>Wi-Fi</title>
    <h1>Wi-Fi</h1>
    <table><tr><td>SSID</td><td>Home</td></tr></table>
    <input name="wpa_key" value="super-secret">
  `);

  expect(parsed.title).toBe("Wi-Fi");
  expect(parsed.values.SSID).toBe("Home");
  expect(parsed.values["Field wpa_key"]).toBe("[redacted]");
  expect(parsed.fields[0]?.sensitive).toBe(true);
});

test("parsePage can include secrets when explicitly requested", () => {
  const parsed = parsePage("wifi", `<input name="wpa_key" value="super-secret">`, { includeSecrets: true });

  expect(parsed.values["Field wpa_key"]).toBe("super-secret");
});

test("parsePage extracts buttons, textareas, and forms", () => {
  const parsed = parsePage("diag", `
    <form method="post" action="/cgi-bin/diag.ha">
      <input name="nonce" value="abc">
      <textarea name="progress">ready</textarea>
      <button name="Ping" value="Ping">Ping</button>
    </form>
  `);

  expect(parsed.textareas).toEqual([{ name: "progress", value: "ready", sensitive: false }]);
  expect(parsed.buttons[0]).toMatchObject({ name: "Ping", type: "submit", value: "Ping", label: "Ping" });
  expect(parsed.forms[0]).toEqual({
    method: "POST",
    action: "/cgi-bin/diag.ha",
    fieldNames: ["nonce"],
    selectNames: [],
    textareaNames: ["progress"],
    buttonNames: ["Ping"],
  });
});

test("parsePage keeps submit inputs out of editable fields", () => {
  const parsed = parsePage("packetfilter", `
    <form method="post" action="/cgi-bin/packetfilter.ha">
      <input name="nonce" value="abc">
      <input type="submit" name="Enable" value="Enable Packet Filters">
    </form>
  `);

  expect(parsed.fields.map((field) => field.name)).toEqual(["nonce"]);
  expect(parsed.buttons.map((button) => button.name)).toEqual(["Enable"]);
  expect(parsed.forms[0]).toMatchObject({
    fieldNames: ["nonce"],
    buttonNames: ["Enable"],
  });
});

test("parsePage gives speed test history stable columns", () => {
  const parsed = parsePage("speed", `
    <table>
      <tr><td>05/23/2026 16:37:05</td><td>upstream</td><td>1242.570000</td><td>28</td><td>40.000000</td><td>Success</td></tr>
    </table>
  `);

  expect(parsed.tables[0]).toEqual({
    Time: "05/23/2026 16:37:05",
    Direction: "upstream",
    Mbps: "1242.570000",
    Server: "28",
    "Latency ms": "40.000000",
    Result: "Success",
  });
});

test("parseDevices handles key-value device table shape", () => {
  const devices = parseDevices(`
    <table>
      <tr><td>MAC Address</td><td>aa:bb:cc:dd:ee:ff</td></tr>
      <tr><td>IPv4 Address / Name</td><td>192.168.1.10 / laptop</td></tr>
      <tr><td>Last Activity</td><td>today</td></tr>
      <tr><td>Status</td><td>on</td></tr>
      <tr><td>Allocation</td><td>dhcp</td></tr>
      <tr><td>Connection Type</td><td>Wi-Fi 5 GHz Radio-1 Type: Home</td></tr>
      <tr><td>Mesh Client</td><td>No</td></tr>
    </table>
  `);

  expect(devices[0]).toEqual({
    status: "on",
    name: "laptop",
    ip: "192.168.1.10",
    mac: "aa:bb:cc:dd:ee:ff",
    connection: "Wi-Fi 5 GHz Radio-1 Type: Home",
    allocation: "dhcp",
    lastActivity: "today",
    meshClient: "No",
  });
});

test("parsePage preserves metric label for blank first table header", () => {
  const parsed = parsePage("voice", `
    <table>
      <tr><th></th><th>Line 1</th><th>Line 2</th></tr>
      <tr><td>Status</td><td>Down</td><td>Down</td></tr>
    </table>
  `);

  expect(parsed.tables[0]).toEqual({ Metric: "Status", "Line 1": "Down", "Line 2": "Down" });
});

test("parsePage reads diagnostic status rows and checked protocol", () => {
  const parsed = parsePage("diag", `
    <table class="diag">
      <tr><th scope="row">Ethernet</th><td>-</td><td><input type="submit" name="EthDetails" value="Details"></td></tr>
      <tr><th scope="row">Authentication</th><td>Pass</td><td><input type="submit" name="AuthDetails" value="Details"></td></tr>
      <tr><th scope="row">IP</th><td>Skipped</td><td><input type="submit" name="IPDetails" value="Details"></td></tr>
      <tr><th scope="row">DNS</th><td>Fail</td><td><input type="submit" name="DNSDetails" value="Details"></td></tr>
    </table>
    <input type="radio" name="protopref" value="IPv4" checked>
    <input type="radio" name="protopref" value="IPv6">
  `);

  expect(parsed.tables).toEqual([
    { Test: "Ethernet", Status: "-" },
    { Test: "Authentication", Status: "Pass" },
    { Test: "IP", Status: "Skipped" },
    { Test: "DNS", Status: "Fail" },
  ]);
  expect(parsed.values["Field protopref"]).toBe("IPv4");
});

test("parsePage extracts sitemap links as table rows", () => {
  const parsed = parsePage("sitemap", `
    <title>Site Map</title>
    <ul>
      <li><a href="/cgi-bin/diag.ha">Troubleshoot</a></li>
      <li><a href="/cgi-bin/speed.ha">Speed Test</a></li>
    </ul>
  `);

  expect(parsed.tables).toEqual([
    { Page: "diag", Label: "Troubleshoot", Href: "/cgi-bin/diag.ha" },
    { Page: "speed", Label: "Speed Test", Href: "/cgi-bin/speed.ha" },
  ]);
});

test("parsePage extracts page description blocks", () => {
  const parsed = parsePage("pshosts", `
    <title>Public Subnet Hosts</title>
    <div class="desc">You must configure a Public Subnet first.</div>
  `);

  expect(parsed.values.Description).toBe("You must configure a Public Subnet first.");
});

test("looksLikeLogin ignores configuration pages with password controls", () => {
  expect(looksLikeLogin(`
    <title>Access Code</title>
    <form action="/cgi-bin/routerpasswd.ha">
      <input id="password" name="old_password" value="">
      <input name="new_password" value="">
    </form>
  `)).toBe(false);

  expect(looksLikeLogin(`
    <title>Login</title>
    <form action="/cgi-bin/login.ha">
      <input id="password" name="password">
    </form>
  `)).toBe(true);
});
