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

test("parsePage extracts Wi-Fi current channels and widths", () => {
  const parsed = parsePage("wconfig_unified", `
    <h2>2.4 GHz Wi-Fi Channel Selection</h2>
    <table><tr><th>Current Channel</th><td>6 (20 MHz)</td><td>Automatic</td></tr></table>
    <h2>5 GHz Wi-Fi Channel Selection</h2>
    <table><tr><th>Current Channel</th><td>60 (80 MHz),161 (80 MHz)</td><td>Automatic</td></tr></table>
  `);

  expect(parsed.tables).toContainEqual({ Radio: "2.4 GHz", "Current Channel": "6", "Channel Width": "20 MHz", Mode: "Automatic" });
  expect(parsed.tables).toContainEqual({ Radio: "5 GHz low-band", "Current Channel": "60", "Channel Width": "80 MHz", Mode: "Automatic" });
  expect(parsed.tables).toContainEqual({ Radio: "5 GHz high-band", "Current Channel": "161", "Channel Width": "80 MHz", Mode: "Automatic" });
});

test("parsePage preserves duplicate and blank router values with section context", () => {
  const parsed = parsePage("broadbandstatistics", `
    <h2>IPv4</h2><table><tr><th>Primary DNS</th><td>192.0.2.1</td></tr></table>
    <h2>IPv6</h2><table><tr><th>Primary DNS</th><td></td></tr></table>
  `);

  expect(parsed.valueEntries).toEqual([
    { section: "IPv4", label: "Primary DNS", value: "192.0.2.1" },
    { section: "IPv6", label: "Primary DNS", value: "" },
  ]);
});

test("parsePage preserves option labels, state, control metadata, and links", () => {
  const parsed = parsePage("wconfig", `
    <a href="/cgi-bin/wconfig_unified.ha">Basic Wi-Fi</a>
    <a href="https://example.com/help">Support</a>
    <input name="power" value="100" readonly>
    <select name="standard" disabled>
      <option value="ax" selected>Wi-Fi 6</option>
      <option value="ac" disabled>Wi-Fi 5</option>
    </select>
  `);

  expect(parsed.fields[0]).toMatchObject({ name: "power", readOnly: true });
  expect(parsed.selects[0]).toMatchObject({
    name: "standard",
    value: "ax",
    disabled: true,
    optionDetails: [
      { value: "ax", label: "Wi-Fi 6", selected: true, disabled: false },
      { value: "ac", label: "Wi-Fi 5", selected: false, disabled: true },
    ],
  });
  expect(parsed.links).toEqual([
    { label: "Basic Wi-Fi", href: "/cgi-bin/wconfig_unified.ha", page: "wconfig_unified", kind: "router-page" },
    { label: "Support", href: "https://example.com/help", kind: "external" },
  ]);
});

test("parsePage gives Ethernet ports explicit current configuration and capabilities", () => {
  const parsed = parsePage("etherlan", `
    <select name="enet1_port1_media"><option value="Auto" selected>Auto</option><option value="5G">5G full duplex</option></select>
    <select name="enet1_port1_mdix"><option value="Auto" selected>Auto</option><option value="On">On</option></select>
  `);

  expect(parsed.tables[0]).toEqual({
    Port: "1",
    "Configured media": "Auto",
    "Configured MDI-X": "Auto",
    "Supported media modes": "Auto, 5G full duplex",
    "Supported MDI-X modes": "Auto, On",
  });
});

test("parsePage labels fiber thresholds with their measurement", () => {
  const parsed = parsePage("fiberstat", `
    <h1>Rx Power&nbsp;&nbsp;Currently -141</h1>
    <table><tr><th></th><th>Low</th><th>High</th></tr><tr><td>Alarm</td><td>0 (Threshold -322)</td><td>0 (Threshold -70)</td></tr></table>
  `);

  expect(parsed.tables).toEqual([{
    Measurement: "Rx Power",
    Current: "-141",
    State: "Alarm",
    Low: "0 (Threshold -322)",
    High: "0 (Threshold -70)",
  }]);
});

test("parsePage captures all voice statistics table shapes", () => {
  const parsed = parsePage("voicestat", `
    <table>
      <tr><th>Line 1</th><th colspan="2">Last Call</th><th colspan="2">Cumulative</th></tr>
      <tr><th></th><th>Incoming</th><th>Outgoing</th><th>Incoming</th><th>Outgoing</th></tr>
      <tr><td>RTP Packet Loss</td><td>1</td><td>2</td><td>3</td><td>4</td></tr>
    </table>
    <table>
      <tr><th>Line 2</th><th colspan="2">Last Call</th><th colspan="2">Cumulative</th></tr>
      <tr><th></th><th>Incoming</th><th>Outgoing</th><th>Incoming</th><th>Outgoing</th></tr>
      <tr><td>RTP Packet Loss</td><td>5</td><td>6</td><td>7</td><td>8</td></tr>
    </table>
    <table>
      <tr><th></th><th colspan="2">Line 1</th><th colspan="2">Line 2</th></tr>
      <tr><th></th><th>Current</th><th>Last</th><th>Current</th><th>Last</th></tr>
      <tr><td>Far-End Caller Information</td><td>caller-a</td><td>caller-b</td><td>caller-c</td><td>caller-d</td></tr>
    </table>
    <table>
      <tr><th></th><th>Line 1</th><th>Line 2</th></tr>
      <tr><td>Number of Calls</td><td>9</td><td>10</td></tr>
    </table>
  `);

  expect(parsed.tables).toHaveLength(4);
  expect(parsed.tables[0]).toMatchObject({ Section: "Call statistics", Line: "Line 1", "Last call incoming": "1", "Cumulative outgoing": "4" });
  expect(parsed.tables[2]).toMatchObject({ Section: "Call summary", "Line 1 current": "[redacted]", "Line 2 last": "[redacted]" });
  expect(parsed.tables[3]).toMatchObject({ Section: "Cumulative since last reset", Metric: "Number of Calls", "Line 1": "9", "Line 2": "10" });
});

test("parsePage models advanced Wi-Fi radio and SSID configuration", () => {
  const parsed = parsePage("wconfig", `
    <input name="power" value="100">
    <input name="ssidname11" value="Home">
    <input name="maxclients" value="80">
    <select name="wl80211on"><option value="on" selected>On</option></select>
    <select name="standard"><option value="g/n" selected>G/N</option></select>
    <select name="bandwidth"><option value="20" selected>20 MHz</option></select>
    <select name="channelplusauto"><option value="auto" selected>Automatic</option></select>
    <select name="ussidenable"><option value="on" selected>On</option></select>
  `);

  expect(parsed.tables).toContainEqual(expect.objectContaining({
    Section: "Radio",
    Radio: "2.4 GHz",
    Enabled: "on",
    Standard: "g/n",
    Bandwidth: "20",
    Channel: "auto",
    "Power level (%)": "100",
  }));
  expect(parsed.tables).toContainEqual(expect.objectContaining({
    Section: "SSID",
    Radio: "2.4 GHz",
    Network: "Home",
    SSID: "Home",
    "Maximum clients": "80",
  }));
});
