import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { parsedPageOutput } from "../src/format.js";
import { resolveSectionCommand } from "../src/pages.js";
import type { ParsedPage } from "../src/types.js";

type ExpectedFixture = {
  page: string;
  pageLoads: boolean;
  dataObtainable: boolean;
  usefulFieldsExist: boolean;
  usefulTablesExist: boolean;
  buttonsDiscovered: boolean;
  formsDiscovered: boolean;
  secretsRedacted: boolean;
  notOnlyJunk: boolean;
  buttonNames: string[];
  fieldNames: string[];
  textareaNames: string[];
  formActions: string[];
};

const expectedDir = join(process.cwd(), "tests", "fixtures", "expected");
const parsedDir = join(process.cwd(), "tests", "fixtures", "parsed");

const commandPages: Array<{ command: string[]; page: string }> = [
  { command: ["device", "status"], page: "home" },
  { command: ["device", "device-list"], page: "devices" },
  { command: ["device", "system-information"], page: "sysinfo" },
  { command: ["device", "access-code"], page: "routerpasswd" },
  { command: ["device", "remote-access"], page: "remoteaccess" },
  { command: ["device", "restart-device"], page: "restart" },

  { command: ["broadband", "status"], page: "broadbandstatistics" },
  { command: ["broadband", "configure"], page: "broadbandconfig" },
  { command: ["broadband", "fiber-status"], page: "fiberstat" },

  { command: ["home-network", "status"], page: "lanstatistics" },
  { command: ["home-network", "configure"], page: "etherlan" },
  { command: ["home-network", "ipv6"], page: "ip6lan" },
  { command: ["home-network", "wi-fi"], page: "wconfig_unified" },
  { command: ["home-network", "mac-filtering"], page: "wmacauth" },
  { command: ["home-network", "subnets-dhcp"], page: "dhcpserver" },
  { command: ["home-network", "ip-allocation"], page: "ipalloc" },

  { command: ["voice", "status"], page: "voice" },
  { command: ["voice", "line-details"], page: "voiceconfig" },
  { command: ["voice", "call-statistics"], page: "voicestat" },

  { command: ["firewall", "status"], page: "firewall" },
  { command: ["firewall", "packet-filter"], page: "packetfilter" },
  { command: ["firewall", "nat-gaming"], page: "apphosting" },
  { command: ["firewall", "public-subnet-hosts"], page: "pshosts" },
  { command: ["firewall", "ip-passthrough"], page: "ippass" },
  { command: ["firewall", "firewall-advanced"], page: "dosprotect" },
  { command: ["firewall", "security-options"], page: "securityoptions" },

  { command: ["diagnostics", "troubleshoot"], page: "diag" },
  { command: ["diagnostics", "speed-test"], page: "speed" },
  { command: ["diagnostics", "logs"], page: "logs" },
  { command: ["diagnostics", "update"], page: "update" },
  { command: ["diagnostics", "resets"], page: "reset" },
  { command: ["diagnostics", "syslog"], page: "syslog" },
  { command: ["diagnostics", "event-notifications"], page: "events" },
  { command: ["diagnostics", "nat-table"], page: "nattable" },
];

test("human router tab commands resolve to captured fixture pages", () => {
  for (const { command, page } of commandPages) {
    const [root, ...args] = command;
    expect(resolveSectionCommand(root!, args)?.page, command.join(" ")).toBe(page);
    if (existsSync(join(expectedDir, `${page}.json`))) {
      expect(readExpected(page).page, command.join(" ")).toBe(page);
      expect(readExpected(page).secretsRedacted, command.join(" ")).toBe(true);
    }
  }
});

test("Diagnostics/Troubleshoot fixture proves inputs, actions, progress, and form target", () => {
  if (!existsSync(join(expectedDir, "diag.json"))) {
    process.stdout.write("diagnostics fixture not present; run `bun run fixtures:capture` with BGW_ACCESS_CODE when the router session pool is available\n");
    return;
  }

  const expected = readExpected("diag");

  expect(expected.pageLoads).toBe(true);
  expect(expected.dataObtainable).toBe(true);
  expect(expected.usefulFieldsExist).toBe(true);
  expect(expected.usefulTablesExist).toBe(true);
  expect(expected.buttonsDiscovered).toBe(true);
  expect(expected.formsDiscovered).toBe(true);
  expect(expected.notOnlyJunk).toBe(true);
  expect(expected.fieldNames).toContain("WebAddress");
  expect(expected.fieldNames).toContain("protopref");
  expect(expected.textareaNames).toContain("ProgressWindow");
  expect(expected.buttonNames).toEqual(expect.arrayContaining([
    "AuthDetails",
    "DNSDetails",
    "EthDetails",
    "IPDetails",
    "Lookup",
    "Ping",
    "RunFullDiagnostics",
    "SendDiagnostics",
    "Trace",
  ]));
  expect(expected.formActions).toEqual(["/cgi-bin/diag.ha"]);
});

test("fixture-backed parsed page JSON includes scriptable summaries", () => {
  if (!existsSync(join(parsedDir, "diag.json"))) {
    process.stdout.write("parsed fixture pack not present; run `bun run fixtures:capture` with BGW_ACCESS_CODE when the router session pool is available\n");
    return;
  }

  const speed = parsedPageOutput(readParsed("speed"));
  expect(speed.summary).toEqual(expect.objectContaining({
    Results: "8",
    "By result": "Success: 8",
  }));
  expect(speed.tables.length).toBe(8);

  const natTable = parsedPageOutput(readParsed("nattable"));
  expect(natTable.summary).toEqual(expect.objectContaining({
    "Total sessions available": expect.any(String),
    "Displayed sessions": "356",
  }));

  const diagnostics = parsedPageOutput(readParsed("diag"));
  expect(diagnostics.summary).toEqual(expect.objectContaining({
    Description: expect.any(String),
    "Field protopref": "IPv4",
  }));
  expect(diagnostics.tables).toEqual(expect.arrayContaining([
    expect.objectContaining({ Test: "Ethernet" }),
    expect.objectContaining({ Test: "Authentication" }),
    expect.objectContaining({ Test: "IP" }),
    expect.objectContaining({ Test: "DNS" }),
  ]));
});

function readExpected(page: string): ExpectedFixture {
  return JSON.parse(readFileSync(join(expectedDir, `${page}.json`), "utf8")) as ExpectedFixture;
}

function readParsed(page: string): ParsedPage {
  return JSON.parse(readFileSync(join(parsedDir, `${page}.json`), "utf8")) as ParsedPage;
}
