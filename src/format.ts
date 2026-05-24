import type { Device, LogEntry, ParsedPage, SitemapEntry } from "./types.js";
import type { PageScan } from "./scan.js";
import type { CompositeStatusResult, DeviceStatusResult, StatusSection } from "./status.js";
import type { ParsedPageResult } from "./fetch.js";
import type { AuditResult } from "./audit.js";
import type { DeviceListResult } from "./devices.js";
import { confirmTokenForPage, dangerousPages } from "./mutations.js";
import type { OperationResult } from "./operations.js";

type ParsedPageOutput = ParsedPage & {
  summary: Record<string, string>;
};

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function parsedPageOutput(page: ParsedPage): ParsedPageOutput {
  return {
    ...page,
    summary: summarizeParsedPage(page),
  };
}

export function printKeyValues(values: Record<string, string>): void {
  const entries = Object.entries(values);
  const width = Math.min(42, Math.max(12, ...entries.map(([key]) => key.length)));
  for (const [key, value] of entries) {
    process.stdout.write(`${key.padEnd(width)}  ${value}\n`);
  }
}

export function printSitemap(entries: SitemapEntry[]): void {
  const pageWidth = Math.max(4, ...entries.map((entry) => entry.page.length));
  for (const entry of entries) {
    process.stdout.write(`${entry.page.padEnd(pageWidth)}  ${entry.label}\n`);
  }
}

function printDevices(devices: Device[], options: { limit?: number } = {}): void {
  const limit = options.limit ?? 20;
  if (devices.length > 0) {
    const byStatus = countBy(devices.map((device) => ({ Status: device.status || "(blank)" })), "Status");
    const byConnection = countBy(devices.map((device) => ({ Connection: summarizeConnection(device.connection) || "(blank)" })), "Connection");
    printKeyValues({
      "Total devices": String(devices.length),
      "By status": formatCounts(byStatus),
      "By connection": formatCounts(byConnection),
    });
    process.stdout.write("\n");
  }

  printRows(devices.slice(0, limit).map((device) => ({
    Status: device.status,
    IP: device.ip,
    MAC: device.mac,
    Connection: summarizeConnection(device.connection),
    "Last activity": device.lastActivity ?? "",
    Name: device.name,
  })), ["Status", "IP", "MAC", "Connection", "Last activity", "Name"]);
  printOverflow(devices.length, limit);
}

export function printDeviceList(result: DeviceListResult, options: { limit?: number } = {}): void {
  if (result.fallback) {
    process.stdout.write("Device List (fallback from IP Allocation)\n");
    if (result.error) process.stdout.write(`devices.ha did not return: ${result.error}\n`);
    process.stdout.write("\n");
  }
  printDevices(result.devices, options);
}

export function printLogs(logs: LogEntry[]): void {
  if (logs.length === 0) {
    process.stdout.write("No log entries found.\n");
    return;
  }
  const byReason = countBy(logs.map((entry) => ({ Reason: entry.reason || "(blank)" })), "Reason");
  const byProtocol = countBy(logs.map((entry) => ({ Protocol: entry.protocol || "(blank)" })), "Protocol");
  printKeyValues({
    Entries: String(logs.length),
    "By reason": formatCounts(byReason),
    "By protocol": formatCounts(byProtocol),
  });
  process.stdout.write("\n");
  printRows(logs.map((entry) => ({
    Time: entry.time,
    Source: entry.source,
    Destination: entry.destination,
    Proto: entry.protocol,
    Reason: entry.reason,
  })), ["Time", "Source", "Destination", "Proto", "Reason"]);
}

export function printScans(scans: PageScan[]): void {
  printRows(scans.map((scan) => ({
    Section: scan.section,
    Tab: scan.label,
    Page: scan.page,
    Status: scan.ok ? String(scan.statusCode ?? "") : "error",
    Fallback: scan.fallback ? "yes" : "",
    Title: scan.title ?? scan.error ?? "",
    Values: String(scan.valueCount ?? 0),
    Tables: String(scan.tableRows ?? 0),
    Fields: String(scan.fieldCount ?? 0),
    Selects: String(scan.selectCount ?? 0),
    Buttons: String(scan.buttonCount ?? 0),
    Forms: String(scan.formCount ?? 0),
    Data: String(scan.dataCount ?? 0),
    Guarded: scan.dangerous ? "yes" : "",
  })), ["Section", "Tab", "Page", "Status", "Fallback", "Title", "Values", "Tables", "Fields", "Selects", "Buttons", "Forms", "Data", "Guarded"]);
}

export function printPageFetchError(result: ParsedPageResult): void {
  process.stdout.write(`Page unavailable: ${result.page}\n`);
  if (result.error) process.stdout.write(`${result.error}\n`);
}

export function printOperation(result: OperationResult): void {
  if (result.dryRun) {
    process.stdout.write(`dry-run: no router ${result.operation} was sent\n`);
  } else {
    process.stdout.write(`${result.operation} committed\n`);
  }

  const values: Record<string, string> = {
    Operation: result.operation,
    Page: result.page,
    Guarded: result.guarded ? "yes" : "no",
    Dangerous: result.dangerous ? "yes" : "no",
  };
  if (result.action) values.Action = result.action;
  if (result.button) values.Button = result.button;
  if (result.target) values.Target = result.target;
  if (result.confirmation) values.Confirmation = result.confirmation;
  if (result.commitCommand) values["Commit command"] = result.commitCommand;
  if (result.statusCode !== undefined) values.Status = String(result.statusCode);
  if (result.location) values.Location = result.location;
  if (result.payload) values.Payload = JSON.stringify(result.payload);
  if (result.changes) values.Changes = JSON.stringify(result.changes);
  printKeyValues(values);
  if (result.result) {
    process.stdout.write("\nResult\n");
    process.stdout.write(`${result.result}\n`);
  }
}

export function printDeviceStatus(result: DeviceStatusResult, options: { limit?: number } = {}): void {
  if (!result.fallback && result.parsed) {
    printParsedPage(result.parsed, { limit: options.limit ?? 20 });
    return;
  }

  process.stdout.write("Device Status (fallback summary)\n\n");
  if (result.error) {
    process.stdout.write(`home.ha did not return: ${result.error}\n\n`);
  }

  printDeviceStatusSummary(result.sections);
}

export function printCompositeStatus(title: string, result: CompositeStatusResult, options: { limit?: number } = {}): void {
  if (!result.fallback && result.parsed) {
    printParsedPage(result.parsed, { limit: options.limit ?? 20 });
    return;
  }

  process.stdout.write(`${title} (fallback)\n\n`);
  if (result.error) {
    process.stdout.write(`${result.page}.ha did not return: ${result.error}\n\n`);
  }

  printStatusSections(result.sections, options.limit ?? 20);
}

export function printAudit(audit: AuditResult): void {
  printKeyValues({
    "Total pages": String(audit.totalPages),
    "OK pages": String(audit.okPages),
    "Failed pages": String(audit.failedPages),
    "Fallback pages": String(audit.fallbackPages),
    "Useful pages": String(audit.usefulPages),
    "Empty OK pages": String(audit.emptyPages),
    "Guarded pages": String(audit.dangerousPages),
  });

  const interesting = audit.pages.filter((page) => !page.ok || page.fallback || !page.useful);
  if (interesting.length > 0) {
    process.stdout.write("\nNeeds attention\n");
    printRows(interesting.map((page) => ({
      Section: page.section,
      Tab: page.label,
      Page: page.page,
      Status: page.ok ? "ok" : "error",
      Fallback: page.fallback ? "yes" : "",
      Data: String(page.dataCount ?? 0),
      Detail: page.error ?? page.title ?? "",
    })), ["Section", "Tab", "Page", "Status", "Fallback", "Data", "Detail"]);
  }
}

export function printParsedPage(page: ParsedPage, options: { forms?: boolean; limit?: number } = {}): void {
  process.stdout.write(`${page.title || page.page}\n\n`);

  if (printSpecializedPage(page, options.limit ?? 20)) {
    if (options.forms) printFormDetails(page);
    return;
  }

  printKeyValues(page.values);

  if (page.tables.length > 0) {
    process.stdout.write("\nTables\n");
    const keys = [...new Set(page.tables.flatMap((row) => Object.keys(row)))];
    printRows(page.tables.slice(0, options.limit ?? 20), keys);
    printOverflow(page.tables.length, options.limit ?? 20);
  }

  if (page.buttons.length > 0 && !options.forms) {
    process.stdout.write("\nAvailable actions\n");
    printRows(page.buttons.map((button) => ({
      Name: button.name,
      Label: button.label,
      Type: button.type,
    })), ["Name", "Label", "Type"]);
  }

  if (!options.forms && (page.fields.length > 0 || page.selects.length > 0 || page.textareas.length > 0)) {
    process.stdout.write("\nControls\n");
    printKeyValues({
      Fields: String(page.fields.filter((field) => field.name !== "nonce" && field.name !== "hashpassword").length),
      Selects: String(page.selects.length),
      Textareas: String(page.textareas.length),
      "Use --forms": "show controls and submit targets",
    });
  }

  if (options.forms) {
    printFormDetails(page);
  }
}

function summarizeParsedPage(page: ParsedPage): Record<string, string> {
  switch (page.page) {
    case "ipalloc":
      return {
        "Total entries": String(page.tables.length),
        "By allocation": formatCounts(countBy(page.tables, "Allocation")),
        "By status": formatCounts(countBy(page.tables, "Status")),
      };
    case "nattable":
      return compactRecord({
        ...selectValues(page, ["Total sessions available", "Total sessions in use", "Select display option"]),
        "Displayed sessions": page.tables.length > 0 ? String(page.tables.length) : undefined,
        "By protocol": page.tables.length > 0 ? formatCounts(countBy(page.tables, "Protocol")) : undefined,
      });
    case "speed": {
      const latestDownstream = page.tables.find((row) => /downstream/i.test(row.Direction ?? ""));
      const latestUpstream = page.tables.find((row) => /upstream/i.test(row.Direction ?? ""));
      return page.tables.length > 0 ? compactRecord({
        Results: String(page.tables.length),
        "By result": formatCounts(countBy(page.tables, "Result")),
        "Latest downstream Mbps": latestDownstream?.Mbps,
        "Latest upstream Mbps": latestUpstream?.Mbps,
      }) : page.values;
    }
    case "broadbandconfig":
      return broadbandConfigSummary(page);
    case "wconfig_unified":
      return wifiSummary(page);
    case "dhcpserver":
      return dhcpServerSummary(page);
    case "ippass":
      return ipPassthroughSummary(page);
    case "apphosting":
      return appHostingSummary(page);
    case "dosprotect":
      return firewallAdvancedSummary(page);
    case "packetfilter":
      return formStateValues(page, [], ["filter_enable", "packet_filter", "protocol"]);
    case "etherlan":
      return formStateValues(page, ["ipaddr", "ipmask"], ["lanipv6"]);
    case "ip6lan":
      return formStateValues(page, ["ip6addr", "ip6prefixlen"], ["ipv6_enable", "dhcp6s_enable", "radvd_enable"]);
    case "wmacauth":
      return formStateValues(page, ["macaddr", "hostname"], ["filtering", "ssid"]);
    case "remoteaccess":
      return formStateValues(page, ["port"], ["remote_enable"]);
    case "routerpasswd":
    case "pshosts":
    case "services":
    case "events":
      return formStateValues(page, [], []);
    default:
      return page.values;
  }
}

function printRows(rows: Record<string, string>[], columns: string[]): void {
  if (rows.length === 0) {
    process.stdout.write("(none)\n");
    return;
  }

  const widths = columns.map((column) => Math.min(36, Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length))));
  process.stdout.write(`${columns.map((column, i) => column.padEnd(widths[i] ?? column.length)).join("  ")}\n`);
  process.stdout.write(`${widths.map((width) => "-".repeat(width)).join("  ")}\n`);
  for (const row of rows) {
    process.stdout.write(`${columns.map((column, i) => truncate(String(row[column] ?? ""), widths[i] ?? 12).padEnd(widths[i] ?? 12)).join("  ")}\n`);
  }
}

function truncate(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, Math.max(0, width - 1))}…` : value;
}

function printSpecializedPage(page: ParsedPage, limit: number): boolean {
  switch (page.page) {
    case "ipalloc":
      printIpAllocation(page, limit);
      return true;
    case "nattable":
      printNatTable(page, limit);
      return true;
    case "diag":
      printDiagnostics(page);
      return true;
    case "broadbandconfig":
      printBroadbandConfigPage(page);
      return true;
    case "wconfig_unified":
      printWifiPage(page);
      return true;
    case "etherlan":
      printFormStatePage(page, ["ipaddr", "ipmask"], ["lanipv6"]);
      return true;
    case "ip6lan":
      printFormStatePage(page, ["ip6addr", "ip6prefixlen"], ["ipv6_enable", "dhcp6s_enable", "radvd_enable"]);
      return true;
    case "wmacauth":
      printFormStatePage(page, ["macaddr", "hostname"], ["filtering", "ssid"]);
      return true;
    case "dhcpserver":
      printDhcpServerPage(page);
      return true;
    case "ippass":
      printIpPassthroughPage(page);
      return true;
    case "firewall":
      printConfigPage(page, ["Packet Filter", "IP Passthrough", "NAT Default Server", "Firewall Advanced"]);
      return true;
    case "remoteaccess":
      printFormStatePage(page, ["port"], ["remote_enable"]);
      return true;
    case "routerpasswd":
      printFormStatePage(page);
      return true;
    case "restart":
      printActionOnlyPage(page);
      return true;
    case "pshosts":
      printFormStatePage(page, ["pubhost"], ["device"]);
      return true;
    case "services":
      printFormStatePage(page, ["name", "globalportstart", "globalportend", "basehostport"], ["protocol"]);
      return true;
    case "apphosting":
      printAppHostingPage(page);
      return true;
    case "packetfilter":
      printPacketFilterPage(page);
      return true;
    case "voice":
    case "voiceconfig":
    case "voicestat":
      printVoicePage(page);
      return true;
    case "syslog":
      printConfigPage(page, ["Syslog", "Server IP Address", "Server Port", "Log Level"]);
      return true;
    case "dosprotect":
      printFirewallAdvancedPage(page);
      return true;
    case "update":
      printActionOnlyPage(page);
      return true;
    case "reset":
      printActionOnlyPage(page);
      return true;
    case "events":
      printFormStatePage(page);
      return true;
    case "logs":
      process.stdout.write("No log entries found.\n");
      return true;
    case "speed":
      printSpeedPage(page, limit);
      return true;
    default:
      return false;
  }
}

function printIpAllocation(page: ParsedPage, limit: number): void {
  const rows = page.tables;
  printKeyValues(summarizeParsedPage(page));

  if (rows.length > 0) {
    process.stdout.write("\nAllocations\n");
    printRows(rows.slice(0, limit), ["IPv4 Address / Name", "MAC Address", "Status", "Allocation", "Action"]);
    printOverflow(rows.length, limit);
  }
  printActionsAndControls(page, limit);
}

function printNatTable(page: ParsedPage, limit: number): void {
  printKeyValues(summarizeParsedPage(page));
  if (page.tables.length > 0) {
    process.stdout.write("\nSessions\n");
    printRows(page.tables.slice(0, limit), ["Protocol", "TCP State", "Source Address", "Source Port", "Destination Address", "Destination Port"]);
    printOverflow(page.tables.length, limit);
  }
  printActionsAndControls(page, limit);
}

function printDiagnostics(page: ParsedPage): void {
  if (page.tables.length > 0) {
    process.stdout.write("Diagnostics\n");
    printRows(page.tables, Object.keys(page.tables[0] ?? {}));
  }
  printActionsAndControls(page, 20);
}

function printSpeedPage(page: ParsedPage, limit: number): void {
  if (page.tables.length > 0) {
    printKeyValues(summarizeParsedPage(page));
    process.stdout.write("\nHistory\n");
    printRows(page.tables.slice(0, limit), ["Time", "Direction", "Mbps", "Latency ms", "Result"]);
    printOverflow(page.tables.length, limit);
  } else {
    printKeyValues(page.values);
  }
  printActionsAndControls(page, limit);
}

function printBroadbandConfigPage(page: ParsedPage): void {
  printKeyValues(broadbandConfigSummary(page));
  printActionsAndControls(page, 20);
}

function printWifiPage(page: ParsedPage): void {
  printKeyValues(wifiSummary(page));
  printActionsAndControls(page, 20);
}

function printDhcpServerPage(page: ParsedPage): void {
  printKeyValues(dhcpServerSummary(page));
  printActionsAndControls(page, 20);
}

function printIpPassthroughPage(page: ParsedPage): void {
  printKeyValues(ipPassthroughSummary(page));
  printActionsAndControls(page, 20);
}

function printAppHostingPage(page: ParsedPage): void {
  printKeyValues(appHostingSummary(page));
  printActionsAndControls(page, 20);
}

function printFirewallAdvancedPage(page: ParsedPage): void {
  printKeyValues(firewallAdvancedSummary(page));
  printActionsAndControls(page, 20);
}

function printPacketFilterPage(page: ParsedPage): void {
  printFormStatePage(page, [], ["filter_enable", "packet_filter", "protocol"]);
}

function printActionOnlyPage(page: ParsedPage): void {
  if (Object.keys(page.values).length > 0) printKeyValues(page.values);
  if (page.tables.length > 0) {
    process.stdout.write("\nTables\n");
    const keys = [...new Set(page.tables.flatMap((row) => Object.keys(row)))];
    printRows(page.tables.slice(0, 20), keys);
    printOverflow(page.tables.length, 20);
  }
  printActionsAndControls(page, 20);
}

function printFormStatePage(page: ParsedPage, preferredFields: string[] = [], preferredSelects: string[] = []): void {
  const values = formStateValues(page, preferredFields, preferredSelects);
  if (Object.keys(values).length > 0) {
    printKeyValues(values);
  } else if (Object.keys(page.values).length > 0) {
    printKeyValues(page.values);
  }

  if (page.tables.length > 0) {
    process.stdout.write("\nTables\n");
    const keys = [...new Set(page.tables.flatMap((row) => Object.keys(row)))];
    printRows(page.tables.slice(0, 20), keys);
    printOverflow(page.tables.length, 20);
  }

  printActionsAndControls(page, 20);
}

function printConfigPage(page: ParsedPage, preferredKeys: string[]): void {
  const values = preferredKeys.length > 0 ? selectValues(page, preferredKeys) : page.values;
  if (Object.keys(values).length > 0) printKeyValues(values);
  printActionsAndControls(page, 20);
}

function printVoicePage(page: ParsedPage): void {
  const rows = page.tables;
  if (rows.length > 0) {
    printRows(rows, Object.keys(rows[0] ?? {}));
  } else {
    printKeyValues(page.values);
  }
  printActionsAndControls(page, 20);
}

function printActionsAndControls(page: ParsedPage, limit: number): void {
  if (page.buttons.length > 0) {
    process.stdout.write("\nAvailable actions\n");
    printRows(page.buttons.slice(0, limit).map((button) => ({
      Name: button.name,
      Label: button.label,
      Type: button.type,
    })), ["Name", "Label", "Type"]);
    printOverflow(page.buttons.length, limit);
  }

  if (page.fields.length > 0 || page.selects.length > 0 || page.textareas.length > 0) {
    process.stdout.write("\nControls\n");
    printKeyValues({
      Fields: String(page.fields.filter((field) => field.name !== "nonce" && field.name !== "hashpassword").length),
      Selects: String(page.selects.length),
      Textareas: String(page.textareas.length),
      "Use --forms": "show controls and submit targets",
    });
  }
}

function printFormDetails(page: ParsedPage): void {
  if (page.buttons.length > 0) {
    process.stdout.write("\nCLI operations\n");
    printRows(page.buttons.map((button) => {
      const buttonName = button.name || button.label;
      const token = confirmTokenForPage(page.page);
      return {
        Button: button.label || buttonName,
        "Dry run": `submit ${page.page} ${quoteArg(buttonName)}`,
        Commit: dangerousPages.has(page.page) ? "blocked on dangerous page" : `submit ${page.page} ${quoteArg(buttonName)} --commit --confirm ${token}`,
      };
    }), ["Button", "Dry run", "Commit"]);
  }

  process.stdout.write("\nFields\n");
  printRows(page.fields.map((field) => ({
    Name: field.name,
    Type: field.type,
    Value: field.value,
    Checked: field.checked ? "yes" : "",
    Sensitive: field.sensitive ? "yes" : "",
  })), ["Name", "Type", "Value", "Checked", "Sensitive"]);

  if (page.selects.length > 0) {
    process.stdout.write("\nSelects\n");
    printRows(page.selects.map((select) => ({
      Name: select.name,
      Value: select.value,
      Options: select.options.join(", "),
      Sensitive: select.sensitive ? "yes" : "",
    })), ["Name", "Value", "Options", "Sensitive"]);
  }

  if (page.textareas.length > 0) {
    process.stdout.write("\nTextareas\n");
    printRows(page.textareas.map((textarea) => ({
      Name: textarea.name,
      Value: textarea.value,
      Sensitive: textarea.sensitive ? "yes" : "",
    })), ["Name", "Value", "Sensitive"]);
  }

  if (page.buttons.length > 0) {
    process.stdout.write("\nButtons\n");
    printRows(page.buttons.map((button) => ({
      Name: button.name,
      Type: button.type,
      Value: button.value,
      Label: button.label,
      Sensitive: button.sensitive ? "yes" : "",
    })), ["Name", "Type", "Value", "Label", "Sensitive"]);
  }

  if (page.forms.length > 0) {
    process.stdout.write("\nForms\n");
    printRows(page.forms.map((form) => ({
      Method: form.method,
      Action: form.action,
      Fields: form.fieldNames.join(", "),
      Selects: form.selectNames.join(", "),
      Textareas: form.textareaNames.join(", "),
      Buttons: form.buttonNames.join(", "),
    })), ["Method", "Action", "Fields", "Selects", "Textareas", "Buttons"]);
  }
}

function quoteArg(value: string): string {
  return /^[a-z0-9_-]+$/i.test(value) ? value : JSON.stringify(value);
}

function printStatusSections(sections: StatusSection[], limit: number): void {
  for (const section of sections) {
    process.stdout.write(`${section.title || section.heading || section.page}\n`);
    if (!section.ok) {
      process.stdout.write(`${section.error ?? "unavailable"}\n\n`);
      continue;
    }
    printKeyValues(section.values);
    if (section.tables.length > 0) {
      const keys = [...new Set(section.tables.flatMap((row) => Object.keys(row)))];
      process.stdout.write("\n");
      printRows(section.tables.slice(0, limit), keys);
      printOverflow(section.tables.length, limit);
    }
    process.stdout.write("\n");
  }
}

function printDeviceStatusSummary(sections: StatusSection[]): void {
  for (const section of sections) {
    const title = section.title || section.heading || section.page;
    process.stdout.write(`${title}\n`);
    if (!section.ok) {
      process.stdout.write(`${section.error ?? "unavailable"}\n\n`);
      continue;
    }
    printKeyValues(summarizeStatusSection(section));
    process.stdout.write("\n");
  }
}

function summarizeStatusSection(section: StatusSection): Record<string, string> {
  switch (section.page) {
    case "sysinfo":
      return selectRecordValues(section.values, [
        "Manufacturer",
        "Model Number",
        "Software Version",
        "Time Since Last Reboot",
        "Current Date/Time",
      ]);
    case "broadbandstatistics":
      return selectRecordValues(section.values, [
        "Broadband Connection",
        "Broadband IPv4 Address",
        "Gateway IPv4 Address",
        "Current Speed (Mbps)",
        "Line State",
        "PON Link Status",
        "UNI Status",
      ]);
    case "firewall":
      return section.values;
    default:
      return section.values;
  }
}

function selectRecordValues(values: Record<string, string>, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.flatMap((key) => values[key] ? [[key, values[key]]] : []));
}

function selectValues(page: ParsedPage, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.flatMap((key) => page.values[key] ? [[key, page.values[key]]] : []));
}

function compactRecord(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function broadbandConfigSummary(page: ParsedPage): Record<string, string> {
  return compactRecord({
    "Broadband source": selectValue(page, "source"),
    "Base MTU": fieldValue(page, "MTUW"),
    "IPv6 MTU": fieldValue(page, "MTU6"),
  });
}

function wifiSummary(page: ParsedPage): Record<string, string> {
  const guestSubnetOctet = fieldValue(page, "u_octet");
  return compactRecord({
    "Home SSID": fieldValue(page, "home_ssidname"),
    "Home SSID enabled": onOff(selectValue(page, "u_ussidenable")),
    "Home security": selectValue(page, "homeSSID_security"),
    "Home password": fieldValue(page, "homeSSID_key"),
    "Guest SSID": fieldValue(page, "guest_ssidname"),
    "Guest SSID enabled": onOff(selectValue(page, "u_gssidenable")),
    "Guest access": guestAccess(selectValue(page, "u_gssidisolate")),
    "Guest subnet": guestSubnetOctet ? `192.168.${guestSubnetOctet}.0/24` : "",
  });
}

function dhcpServerSummary(page: ParsedPage): Record<string, string> {
  return compactRecord({
    "Gateway address": fieldValue(page, "ipaddr"),
    "Subnet mask": fieldValue(page, "ipmask"),
    "DHCP enabled": onOff(selectValue(page, "dhcp")),
    "DHCP start": fieldValue(page, "dhcpstart"),
    "DHCP end": fieldValue(page, "dhcpend"),
    "DHCP lease": durationFields(page, "dhcp"),
    "Primary pool": checkedRadioValue(page, "primpool"),
    "Public subnet": onOff(selectValue(page, "pubsub")),
    "Allow inbound": onOff(selectValue(page, "ain")),
    "Cascaded router": onOff(selectValue(page, "cr")),
  });
}

function ipPassthroughSummary(page: ParsedPage): Record<string, string> {
  return compactRecord({
    "Allocation mode": selectValue(page, "allocmode"),
    "Default server": fieldValue(page, "defsrvint"),
    "Passthrough mode": selectValue(page, "passmode"),
    "Passthrough MAC": fieldValue(page, "passmac"),
    "DHCP lease": durationFields(page, "dhcp"),
  });
}

function appHostingSummary(page: ParsedPage): Record<string, string> {
  const service = selectByName(page, "service");
  const device = selectByName(page, "device");
  return compactRecord({
    "Selected service": service?.value ?? "",
    "Selected device": device?.value ?? "",
    "Known services": service ? String(service.options.length) : "",
    "Known devices": device ? String(device.options.length) : "",
  });
}

function firewallAdvancedSummary(page: ParsedPage): Record<string, string> {
  return compactRecord({
    "Drop ICMP to LAN": onOff(selectValue(page, "downstream_echo_rqst_drop")),
    "Drop ICMP to device LAN": onOff(selectValue(page, "downstream_echo_rqst_drop_lan")),
    "Drop ICMP to device WAN": onOff(selectValue(page, "icmp_downstream_echo_rqst_drop_wan")),
    "Reflexive ACL": onOff(selectValue(page, "reflexive")),
    "ESP ALG": onOff(selectValue(page, "algesp")),
    "SIP ALG": onOff(selectValue(page, "algsip")),
  });
}

function formStateValues(page: ParsedPage, preferredFields: string[], preferredSelects: string[]): Record<string, string> {
  const fields = orderByPreference(
    page.fields.filter((field) => isUserFacingField(field.name, field.type) && (field.type !== "radio" || field.checked)),
    preferredFields,
    (field) => field.name,
  );
  const selects = orderByPreference(page.selects, preferredSelects, (select) => select.name);

  return compactRecord({
    ...Object.fromEntries(selects.map((select) => [labelizeName(select.name), onOff(select.value)])),
    ...Object.fromEntries(fields.map((field) => [labelizeName(field.name), field.type === "checkbox" ? yesNo(field.checked) : field.value])),
  });
}

function isUserFacingField(name: string, type: string): boolean {
  if (name === "nonce" || name === "hashpassword") return false;
  if (type === "hidden") return false;
  return true;
}

function orderByPreference<T>(items: T[], preferred: string[], nameOf: (item: T) => string): T[] {
  const byName = new Map(items.map((item) => [nameOf(item), item]));
  const preferredItems = preferred.flatMap((name) => byName.get(name) ? [byName.get(name)!] : []);
  const preferredSet = new Set(preferred);
  return [
    ...preferredItems,
    ...items.filter((item) => !preferredSet.has(nameOf(item))).sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
  ];
}

function labelizeName(name: string): string {
  return name
    .replace(/^u_/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldValue(page: ParsedPage, name: string): string {
  return page.fields.find((field) => field.name === name)?.value ?? "";
}

function selectByName(page: ParsedPage, name: string) {
  return page.selects.find((select) => select.name === name);
}

function selectValue(page: ParsedPage, name: string): string {
  return selectByName(page, name)?.value ?? "";
}

function checkedRadioValue(page: ParsedPage, name: string): string {
  return page.fields.find((field) => field.name === name && field.checked)?.value ?? "";
}

function durationFields(page: ParsedPage, prefix: string): string {
  const day = fieldValue(page, `${prefix}day`) || "0";
  const hour = fieldValue(page, `${prefix}hour`) || "0";
  const min = fieldValue(page, `${prefix}min`) || "0";
  const sec = fieldValue(page, `${prefix}sec`) || "0";
  return `${day}d ${hour}h ${min}m ${sec}s`;
}

function onOff(value: string): string {
  if (value === "on") return "On";
  if (value === "off") return "Off";
  return value;
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function guestAccess(value: string): string {
  if (value === "on") return "Internet Only";
  if (value === "off") return "Internet & Home LAN";
  return value;
}

function countBy(rows: Record<string, string>[], key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = row[key] || "(blank)";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries.map(([key, count]) => `${key}: ${count}`).join(", ") : "(none)";
}

function printOverflow(total: number, limit: number): void {
  if (total > limit) {
    process.stdout.write(`... ${total - limit} more rows. Use --limit ${total} to show all.\n`);
  }
}

function summarizeConnection(value: string): string {
  return value.replace(/\s+Type:.*$/i, "").trim();
}
