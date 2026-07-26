import type { Device, LogEntry, ParsedButton, ParsedField, ParsedForm, ParsedLink, ParsedPage, ParsedSelect, ParsedTextarea, ParsedValueEntry, SitemapEntry } from "./types.js";
import { cleanText, extractTables, getAttrs, getHeading, getTitle, stripTags } from "./html.js";
import { isSensitiveName, redactValue } from "./redact.js";

const buttonInputTypes = new Set(["submit", "button", "reset", "image"]);

export function parseSitemap(html: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']*\/cgi-bin\/([^"']+?)\.ha)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] ?? "";
    const page = match[2] ?? "";
    const label = stripTags(match[3] ?? "");
    const key = `${page}:${label}`;
    if (!page || !label || seen.has(key)) continue;
    seen.add(key);
    entries.push({ page, label, href });
  }

  return entries.sort((a, b) => a.page.localeCompare(b.page) || a.label.localeCompare(b.label));
}

export function parsePage(page: string, html: string, options: { includeSecrets?: boolean } = {}): ParsedPage {
  const includeSecrets = options.includeSecrets === true;
  const htmlTables = extractTables(html);
  const values: Record<string, string> = {};
  const tables: Record<string, string>[] = [];
  const valueEntries = parseValueEntries(html, includeSecrets);
  for (const entry of valueEntries) {
    if (entry.value) values[entry.label] = entry.value;
  }

  for (const table of htmlTables) {
    const headers = table[0];
    if (!headers || headers.length <= 2) continue;
    for (const row of table.slice(1)) {
      if (row.length === headers.length) {
        const record: Record<string, string> = {};
        headers.forEach((header, i) => {
          const key = cleanText(header) || (i === 0 ? "Metric" : "");
          if (key) record[key] = redactValue(key, cleanText(row[i] ?? ""), includeSecrets);
        });
        if (Object.keys(record).length > 0) tables.push(record);
      }
    }
  }

  for (const h1 of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const text = stripTags(h1[1] ?? "");
    const parts = text.split(/\s+Currently\s+/);
    if (parts.length === 2 && parts[0] && parts[1]) {
      values[parts[0].trim()] = redactValue(parts[0], parts[1].trim(), includeSecrets);
    }
  }

  for (const [i, description] of parseDescriptionBlocks(html).entries()) {
    values[i === 0 ? "Description" : `Description ${i + 1}`] = redactValue("Description", description, includeSecrets);
  }

  const fields = parseFields(html, includeSecrets);
  const selects = parseSelects(html, includeSecrets);
  const textareas = parseTextareas(html, includeSecrets);
  const buttons = parseButtons(html, includeSecrets);
  const forms = parseForms(html);
  const links = parseLinks(html);

  for (const field of fields) {
    if ((field.type === "radio" || field.type === "checkbox") && !field.checked) continue;
    if (field.value && field.name !== "nonce" && field.name !== "hashpassword") {
      values[`Field ${field.name}`] = field.value;
    }
  }

  for (const select of selects) {
    if (select.value) values[`Field ${select.name}`] = select.value;
  }

  for (const textarea of textareas) {
    if (textarea.value) values[`Field ${textarea.name}`] = textarea.value;
  }

  let parsedTables = page === "sitemap"
    ? parseSitemap(html).map((entry) => ({ Page: entry.page, Label: entry.label, Href: entry.href }))
    : page === "speed"
    ? parseSpeedTables(html)
    : page === "diag"
      ? parseDiagnosticTables(html)
      : dedupeRecords(tables);
  const pageSpecificTables = parsePageSpecificTables(page, html, fields, selects, includeSecrets);
  if (["etherlan", "fiberstat", "voice", "voiceconfig", "voicestat"].includes(page)) parsedTables = [];

  return {
    page,
    title: getTitle(html),
    heading: getHeading(html),
    values,
    valueEntries,
    tables: dedupeRecords([...parsedTables, ...pageSpecificTables]),
    fields,
    selects,
    textareas,
    buttons,
    forms,
    links,
  };
}

function parsePageSpecificTables(
  page: string,
  html: string,
  fields: ParsedField[],
  selects: ParsedSelect[],
  includeSecrets: boolean,
): Record<string, string>[] {
  switch (page) {
    case "wconfig_unified":
      return parseWifiChannelTables(html);
    case "wconfig":
      return parseAdvancedWifiTables(fields, selects);
    case "etherlan":
      return parseEthernetPortTables(selects);
    case "wmacauth":
      return parseWifiMacFilterTables(selects);
    case "fiberstat":
      return parseFiberThresholdTables(html);
    case "voice":
    case "voiceconfig":
      return parseVoiceStatusTables(html, includeSecrets);
    case "voicestat":
      return parseVoiceStatisticsTables(html, includeSecrets);
    default:
      return [];
  }
}

function parseValueEntries(html: string, includeSecrets: boolean): ParsedValueEntry[] {
  const entries: ParsedValueEntry[] = [];
  for (const tableMatch of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const tableHtml = tableMatch[0] ?? "";
    const section = nearestHeading(html, tableMatch.index ?? 0);
    for (const rowMatch of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...(rowMatch[1] ?? "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1] ?? "");
      if (cells.length !== 2 || /<(?:input|select|textarea|button)\b/i.test(cells[1] ?? "")) continue;
      const rawLabel = stripTags(cells[0] ?? "").replace(/:$/, "");
      if (!rawLabel) continue;
      const { label, defaultValue } = splitDefaultValue(rawLabel, includeSecrets);
      const value = redactValue(label, stripTags(cells[1] ?? ""), includeSecrets);
      entries.push({
        section,
        label,
        value,
        ...(defaultValue !== undefined ? { defaultValue } : {}),
      });
    }
  }
  return entries;
}

function nearestHeading(html: string, before: number): string {
  const headings = [...html.slice(0, before).matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  return stripTags(headings.at(-1)?.[1] ?? "");
}

function splitDefaultValue(label: string, includeSecrets: boolean): { label: string; defaultValue?: string } {
  const match = label.match(/^(.*?\bDefault):\s*(.+)$/i);
  if (!match?.[1] || !match[2]) return { label };
  const normalized = cleanText(match[1]);
  return {
    label: normalized,
    defaultValue: redactValue(normalized, cleanText(match[2]), includeSecrets),
  };
}

function parseLinks(html: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = getAttrs(`<a ${match[1] ?? ""}>`);
    const href = attrs.href ?? "";
    if (!href) continue;
    const label = stripTags(match[2] ?? "") || attrs.title || href;
    const page = href.match(/\/cgi-bin\/([^/?#]+)\.ha/i)?.[1];
    const kind: ParsedLink["kind"] = page ? "router-page" : /^https?:\/\//i.test(href) ? "external" : "other";
    const key = `${href}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      label,
      href,
      ...(page ? { page } : {}),
      kind,
    });
  }
  return links;
}

function parseWifiChannelTables(html: string): Record<string, string>[] {
  const channels: Record<string, string>[] = [];
  for (const match of html.matchAll(/<h2\b[^>]*>\s*((?:2\.4|5)\s*GHz)[\s\S]*?<\/h2>([\s\S]*?)(?=<h2\b|<\/form>|$)/gi)) {
    const band = cleanText(match[1] ?? "");
    const table = extractTables(match[2] ?? "")[0] ?? [];
    const row = table.find((candidate) => cleanText(candidate[0] ?? "") === "Current Channel");
    if (!row) continue;

    const current = cleanText(row[1] ?? "");
    const parsed = [...current.matchAll(/(\d+)\s*\(([^)]+)\)/g)];
    if (parsed.length === 0) {
      channels.push({
        Radio: band,
        "Current Channel": current,
        "Channel Width": "",
        Mode: cleanText(row[2] ?? ""),
      });
      continue;
    }
    for (const entry of parsed) {
      const channel = entry[1] ?? "";
      channels.push({
        Radio: radioName(band, channel, parsed.length),
        "Current Channel": channel,
        "Channel Width": cleanText(entry[2] ?? ""),
        Mode: cleanText(row[2] ?? ""),
      });
    }
  }
  return channels;
}

function radioName(band: string, channel: string, count: number): string {
  if (/^2\.4/i.test(band) || count === 1) return band;
  return Number(channel) < 100 ? "5 GHz low-band" : "5 GHz high-band";
}

function parseAdvancedWifiTables(fields: ParsedField[], selects: ParsedSelect[]): Record<string, string>[] {
  const field = (name: string): string => fields.find((candidate) => candidate.name === name)?.value ?? "";
  const select = (name: string): string => selects.find((candidate) => candidate.name === name)?.value ?? "";
  return [
    {
      Section: "Radio",
      Radio: "2.4 GHz",
      Enabled: select("wl80211on"),
      Standard: select("standard"),
      Bandwidth: select("bandwidth"),
      Channel: select("channelplusauto"),
      "Power level (%)": field("power"),
    },
    {
      Section: "Radio",
      Radio: "5 GHz (combined configuration)",
      Enabled: select("wl80211on_5"),
      Standard: select("standard_5"),
      Bandwidth: select("bandwidth_5"),
      Channel: "",
      "Power level (%)": field("power_5"),
    },
    {
      Section: "SSID",
      Radio: "2.4 GHz",
      Network: "Home",
      Enabled: select("ussidenable"),
      SSID: field("ssidname11"),
      Hidden: select("hide"),
      Security: select("security11"),
      "WPA version": select("wpaversion"),
      WPS: select("wps"),
      "Maximum clients": field("maxclients"),
    },
    {
      Section: "SSID",
      Radio: "2.4 GHz",
      Network: "Guest",
      Enabled: select("gssidenable"),
      SSID: field("ssidname12"),
      Hidden: select("hide2"),
      Security: select("security12"),
      "WPA version": select("wpaversion2"),
      WPS: "",
      "Maximum clients": field("maxclients2"),
    },
    {
      Section: "SSID",
      Radio: "5 GHz (combined configuration)",
      Network: "Home",
      Enabled: select("wl80211on_5"),
      SSID: field("ssidname21"),
      Hidden: select("hide_5"),
      Security: select("security21"),
      "WPA version": select("wpaversion_5"),
      WPS: select("wps_5"),
      "Maximum clients": field("maxclients_5"),
    },
  ];
}

function parseEthernetPortTables(selects: ParsedSelect[]): Record<string, string>[] {
  return [1, 2, 3, 4].map((port) => {
    const media = selects.find((select) => select.name === `enet${port}_port${port}_media`);
    const mdix = selects.find((select) => select.name === `enet${port}_port${port}_mdix`);
    return {
      Port: String(port),
      "Configured media": media?.value ?? "",
      "Configured MDI-X": mdix?.value ?? "",
      "Supported media modes": optionLabels(media).join(", "),
      "Supported MDI-X modes": optionLabels(mdix).join(", "),
    };
  });
}

function parseWifiMacFilterTables(selects: ParsedSelect[]): Record<string, string>[] {
  const definitions = [
    ["2.4 GHz", "Home", "wmacr1user"],
    ["2.4 GHz", "Guest", "wmacr1guest"],
    ["5 GHz", "Home", "wmacr2user"],
  ] as const;
  return definitions.map(([radio, network, name]) => ({
    Radio: radio,
    Network: network,
    Filtering: selects.find((select) => select.name === name)?.value ?? "",
  }));
}

function optionLabels(select: ParsedSelect | undefined): string[] {
  return select?.optionDetails?.map((option) => option.label) ?? select?.options ?? [];
}

function parseFiberThresholdTables(html: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  for (const match of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const heading = stripTags(match[1] ?? "");
    if (!/\s+Currently\s+/i.test(heading)) continue;
    const [measurement = "", current = ""] = heading.split(/\s+Currently\s+/, 2);
    const remainder = html.slice((match.index ?? 0) + (match[0]?.length ?? 0));
    const tableHtml = remainder.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0] ?? "";
    const table = extractTables(tableHtml)[0] ?? [];
    for (const row of table.slice(1)) {
      if (row.length !== 3) continue;
      records.push({
        Measurement: cleanText(measurement),
        Current: cleanText(current),
        State: cleanText(row[0] ?? ""),
        Low: cleanText(row[1] ?? ""),
        High: cleanText(row[2] ?? ""),
      });
    }
  }
  return records;
}

function parseVoiceStatisticsTables(html: string, includeSecrets: boolean): Record<string, string>[] {
  const tables = extractTables(html);
  const records: Record<string, string>[] = [];

  for (const [index, line] of ["Line 1", "Line 2"].entries()) {
    const table = tables[index] ?? [];
    for (const row of table.slice(2)) {
      if (row.length !== 5) continue;
      records.push({
        Section: "Call statistics",
        Line: line,
        Metric: cleanText(row[0] ?? ""),
        "Last call incoming": cleanText(row[1] ?? ""),
        "Last call outgoing": cleanText(row[2] ?? ""),
        "Cumulative incoming": cleanText(row[3] ?? ""),
        "Cumulative outgoing": cleanText(row[4] ?? ""),
      });
    }
  }

  const summary = tables[2] ?? [];
  for (const row of summary.slice(2)) {
    if (row.length !== 5) continue;
    const metric = cleanText(row[0] ?? "");
    records.push({
      Section: "Call summary",
      Line: "Both",
      Metric: metric,
      "Line 1 current": redactValue(metric, cleanText(row[1] ?? ""), includeSecrets),
      "Line 1 last": redactValue(metric, cleanText(row[2] ?? ""), includeSecrets),
      "Line 2 current": redactValue(metric, cleanText(row[3] ?? ""), includeSecrets),
      "Line 2 last": redactValue(metric, cleanText(row[4] ?? ""), includeSecrets),
    });
  }

  const cumulative = tables[3] ?? [];
  for (const row of cumulative.slice(1)) {
    if (row.length !== 3) continue;
    records.push({
      Section: "Cumulative since last reset",
      Line: "Both",
      Metric: cleanText(row[0] ?? ""),
      "Line 1": cleanText(row[1] ?? ""),
      "Line 2": cleanText(row[2] ?? ""),
    });
  }
  return records;
}

function parseVoiceStatusTables(html: string, includeSecrets: boolean): Record<string, string>[] {
  return extractTables(html).flatMap((table) => {
    return table.slice(1).flatMap((row) => {
      if (row.length !== 3) return [];
      const metric = cleanText(row[0] ?? "");
      if (!metric) return [];
      return [{
        Metric: metric,
        "Line 1": redactValue(metric, cleanText(row[1] ?? ""), includeSecrets),
        "Line 2": redactValue(metric, cleanText(row[2] ?? ""), includeSecrets),
      }];
    });
  });
}

export function parseDevices(html: string): Device[] {
  const devices: Device[] = [];

  for (const table of extractTables(html)) {
    const text = table.flat().join(" ");
    if (!/MAC Address/i.test(text)) continue;

    if (table.some((row) => row[0] === "MAC Address" && row.length === 2)) {
      let current: Record<string, string> = {};
      const flush = (): void => {
        if (!current["MAC Address"]) return;
        const nameIp = current["IPv4 Address / Name"] ?? current.Name ?? "";
        const split = nameIp.split("/");
        devices.push({
          status: current.Status ?? "",
          name: split.length > 1 ? cleanText(split.slice(1).join("/")) : (current.Name ?? nameIp),
          ip: split.length > 1 ? cleanText(split[0] ?? "") : "",
          mac: current["MAC Address"] ?? "",
          connection: current["Connection Type"] ?? "",
          connectionSpeed: current["Connection Speed"],
          allocation: current.Allocation,
          lastActivity: current["Last Activity"],
          meshClient: current["Mesh Client"],
          ipv6: current["IPv6 Address"],
          deviceType: current.Type,
          validLifetime: current["Valid Lifetime"],
          preferredLifetime: current["Preferred Lifetime"],
        });
      };

      for (const row of table) {
        if (row.length < 2 || !row[0]) continue;
        const key = cleanText(row[0]);
        const value = cleanText(row[1] ?? "");
        if (key === "MAC Address") {
          flush();
          current = {};
        }
        current[key] = value;
      }
      flush();
      continue;
    }

    for (const row of table.slice(1)) {
      if (row.length < 4) continue;
      const status = cleanText(row[0] ?? "");
      const nameIp = cleanText(row[1] ?? "");
      const split = nameIp.split("/");
      const ip = split.length > 1 ? cleanText(split[0] ?? "") : cleanText(row[2] ?? "");
      const name = split.length > 1 ? cleanText(split.slice(1).join("/")) : nameIp;
      devices.push({
        status,
        name,
        ip: ip || "Unknown",
        mac: cleanText(row[3] ?? "Unknown"),
        connection: cleanText(row[4] ?? "Unknown"),
      });
    }
  }

  return devices;
}

export function parseLogs(html: string): LogEntry[] {
  const table = extractTables(html)[0] ?? [];
  return table.slice(1).flatMap((row) => {
    if (row.length < 6) return [];
    return [{
      id: cleanText(row[0] ?? ""),
      time: cleanText(row[1] ?? ""),
      source: cleanText(row[2] ?? ""),
      destination: cleanText(row[3] ?? ""),
      protocol: cleanText(row[4] ?? ""),
      reason: cleanText(row[5] ?? ""),
    }];
  });
}

export function looksLikeLogin(html: string): boolean {
  const title = getTitle(html);
  return /^Login$/i.test(title)
    || /Access Code Required/i.test(html)
    || /<form\b[^>]*action=["'][^"']*\/cgi-bin\/login\.ha["'][^>]*>[\s\S]*id=["']password["']/i.test(html);
}

function parseFields(html: string, includeSecrets: boolean): ParsedField[] {
  const fields: ParsedField[] = [];
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = getAttrs(match[0] ?? "");
    const name = attrs.name || attrs.id;
    if (!name) continue;
    const type = attrs.type || "text";
    if (buttonInputTypes.has(type.toLowerCase())) continue;
    const sensitive = isSensitiveName(name);
    fields.push({
      name,
      type,
      value: redactValue(name, attrs.value ?? "", includeSecrets),
      checked: "checked" in attrs,
      sensitive,
      ...("disabled" in attrs ? { disabled: true } : {}),
      ...("readonly" in attrs ? { readOnly: true } : {}),
    });
  }
  return fields;
}

function parseSelects(html: string, includeSecrets: boolean): ParsedSelect[] {
  const selects: ParsedSelect[] = [];
  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const attrs = getAttrs(`<select ${match[1] ?? ""}>`);
    const name = attrs.name || attrs.id;
    if (!name) continue;
    const body = match[2] ?? "";
    const optionDetails = [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((option) => {
      const optionAttrs = getAttrs(`<option ${option[1] ?? ""}>`);
      const label = stripTags(option[2] ?? "");
      return {
        label,
        value: optionAttrs.value || label,
        selected: "selected" in optionAttrs,
        disabled: "disabled" in optionAttrs,
      };
    });
    const selected = optionDetails.find((option) => option.selected) ?? optionDetails[0];
    const sensitive = isSensitiveName(name);
    selects.push({
      name,
      value: redactValue(name, selected?.value ?? "", includeSecrets),
      options: optionDetails.map((option) => redactValue(name, option.value, includeSecrets)),
      sensitive,
      optionDetails: optionDetails.map((option) => ({
        ...option,
        value: redactValue(name, option.value, includeSecrets),
        label: redactValue(name, option.label, includeSecrets),
      })),
      ...("disabled" in attrs ? { disabled: true } : {}),
    });
  }
  return selects;
}

function parseTextareas(html: string, includeSecrets: boolean): ParsedTextarea[] {
  const textareas: ParsedTextarea[] = [];
  for (const match of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const attrs = getAttrs(`<textarea ${match[1] ?? ""}>`);
    const name = attrs.name || attrs.id;
    if (!name) continue;
    const sensitive = isSensitiveName(name);
    textareas.push({
      name,
      value: redactValue(name, stripTags(match[2] ?? ""), includeSecrets),
      sensitive,
      ...("disabled" in attrs ? { disabled: true } : {}),
      ...("readonly" in attrs ? { readOnly: true } : {}),
    });
  }
  return textareas;
}

function parseButtons(html: string, includeSecrets: boolean): ParsedButton[] {
  const buttons: ParsedButton[] = [];
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = getAttrs(match[0] ?? "");
    const type = (attrs.type || "text").toLowerCase();
    if (!buttonInputTypes.has(type)) continue;
    const name = attrs.name || attrs.id || attrs.value || type;
    const value = attrs.value ?? "";
    const sensitive = isSensitiveName(name);
    buttons.push({
      name,
      type,
      value: redactValue(name, value, includeSecrets),
      label: redactValue(name, value || name, includeSecrets),
      sensitive,
      ...("disabled" in attrs ? { disabled: true } : {}),
    });
  }

  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = getAttrs(`<button ${match[1] ?? ""}>`);
    const type = attrs.type || "submit";
    const label = stripTags(match[2] ?? "");
    const name = attrs.name || attrs.id || attrs.value || label || type;
    const sensitive = isSensitiveName(name);
    buttons.push({
      name,
      type,
      value: redactValue(name, attrs.value ?? label, includeSecrets),
      label: redactValue(name, label || attrs.value || name, includeSecrets),
      sensitive,
      ...("disabled" in attrs ? { disabled: true } : {}),
    });
  }

  return buttons;
}

function parseForms(html: string): ParsedForm[] {
  const forms: ParsedForm[] = [];
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = getAttrs(`<form ${match[1] ?? ""}>`);
    const body = match[2] ?? "";
    forms.push({
      method: (attrs.method || "GET").toUpperCase(),
      action: attrs.action || "",
      fieldNames: inputNamesFromForm(body, "field"),
      selectNames: namesFromTags(body, "select"),
      textareaNames: namesFromTags(body, "textarea"),
      buttonNames: [...new Set([...inputNamesFromForm(body, "button"), ...namesFromTags(body, "button")])],
    });
  }
  return forms;
}

function parseDescriptionBlocks(html: string): string[] {
  const descriptions: string[] = [];
  for (const match of html.matchAll(/<div\b[^>]*class=["'][^"']*\bdesc\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    const text = stripTags(match[1] ?? "");
    if (text) descriptions.push(text);
  }
  return [...new Set(descriptions)];
}

function inputNamesFromForm(html: string, kind: "field" | "button"): string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = getAttrs(match[0] ?? "");
    const type = (attrs.type || "text").toLowerCase();
    const isButton = buttonInputTypes.has(type);
    if ((kind === "button") !== isButton) continue;
    const name = attrs.name || attrs.id;
    if (name) names.add(name);
  }
  return [...names];
}

function namesFromTags(html: string, tagName: "input" | "select" | "textarea" | "button"): string[] {
  const names = new Set<string>();
  const pattern = tagPattern(tagName);
  for (const match of html.matchAll(pattern)) {
    const attrs = getAttrs(match[0] ?? "");
    const name = attrs.name || attrs.id;
    if (name) names.add(name);
  }
  return [...names];
}

function tagPattern(tagName: "input" | "select" | "textarea" | "button"): RegExp {
  switch (tagName) {
    case "input":
      return /<input\b[^>]*>/gi;
    case "select":
      return /<select\b[^>]*>/gi;
    case "textarea":
      return /<textarea\b[^>]*>/gi;
    case "button":
      return /<button\b[^>]*>/gi;
  }
}

function dedupeRecords(records: Record<string, string>[]): Record<string, string>[] {
  const seen = new Set<string>();
  const output: Record<string, string>[] = [];
  for (const record of records) {
    const key = JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(record);
  }
  return output;
}

function parseSpeedTables(html: string): Record<string, string>[] {
  return extractTables(html).flatMap((table) => {
    return table.flatMap((row) => {
      if (row.length < 6) return [];
      return [{
        Time: cleanText(row[0] ?? ""),
        Direction: cleanText(row[1] ?? ""),
        Mbps: cleanText(row[2] ?? ""),
        Server: cleanText(row[3] ?? ""),
        "Latency ms": cleanText(row[4] ?? ""),
        Result: cleanText(row[5] ?? ""),
      }];
    });
  });
}

function parseDiagnosticTables(html: string): Record<string, string>[] {
  return extractTables(html).flatMap((table) => {
    return table.flatMap((row) => {
      if (row.length < 2) return [];
      const test = cleanText(row[0] ?? "");
      const status = cleanText(row[1] ?? "");
      if (!test || !["Ethernet", "Authentication", "IP", "DNS"].includes(test)) return [];
      return [{ Test: test, Status: status }];
    });
  });
}
