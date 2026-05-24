import type { Device, LogEntry, ParsedButton, ParsedField, ParsedForm, ParsedPage, ParsedSelect, ParsedTextarea, SitemapEntry } from "./types.js";
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

  for (const table of htmlTables) {
    for (const row of table) {
      if (row.length === 2) {
        const key = cleanText((row[0] ?? "").replace(/:$/, ""));
        const value = cleanText(row[1] ?? "");
        if (key && value && value !== "OffOn" && value !== "OnOff") {
          values[key] = redactValue(key, value, includeSecrets);
        }
      }
    }

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

  const parsedTables = page === "sitemap"
    ? parseSitemap(html).map((entry) => ({ Page: entry.page, Label: entry.label, Href: entry.href }))
    : page === "speed"
    ? parseSpeedTables(html)
    : page === "diag"
      ? parseDiagnosticTables(html)
      : dedupeRecords(tables);

  return {
    page,
    title: getTitle(html),
    heading: getHeading(html),
    values,
    tables: parsedTables,
    fields,
    selects,
    textareas,
    buttons,
    forms,
  };
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
          allocation: current.Allocation,
          lastActivity: current["Last Activity"],
          meshClient: current["Mesh Client"],
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
    const options = [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((option) => {
      const optionAttrs = getAttrs(`<option ${option[1] ?? ""}>`);
      const text = stripTags(option[2] ?? "");
      return {
        text,
        value: optionAttrs.value || text,
        selected: "selected" in optionAttrs,
      };
    });
    const selected = options.find((option) => option.selected) ?? options[0];
    const sensitive = isSensitiveName(name);
    selects.push({
      name,
      value: redactValue(name, selected?.value ?? "", includeSecrets),
      options: options.map((option) => redactValue(name, option.value, includeSecrets)),
      sensitive,
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
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  for (const match of html.matchAll(pattern)) {
    const attrs = getAttrs(match[0] ?? "");
    const name = attrs.name || attrs.id;
    if (name) names.add(name);
  }
  return [...names];
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
