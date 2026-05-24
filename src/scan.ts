import type { BGW320Client } from "./client.js";
import { fetchParsedPage, parsedDataCount } from "./fetch.js";
import { routerTabs, type RouterTab } from "./pages.js";
import { fetchDeviceStatus, fetchHomeNetworkStatus, fetchSecurityOptions } from "./status.js";
import type { ParsedPage } from "./types.js";
import { fetchDeviceList } from "./devices.js";

export type PageScan = {
  section: string;
  label: string;
  page: string;
  dangerous: boolean;
  ok: boolean;
  fallback?: boolean;
  statusCode?: number;
  error?: string;
  title?: string;
  heading?: string;
  valueCount?: number;
  tableRows?: number;
  fieldCount?: number;
  selectCount?: number;
  textareaCount?: number;
  buttonCount?: number;
  formCount?: number;
  dataCount?: number;
  parsed?: ParsedPage;
};

export async function scanRouter(client: BGW320Client, options: { delayMs: number; includeParsed?: boolean }): Promise<PageScan[]> {
  const scans: PageScan[] = [];
  const seen = new Set<string>();

  for (const tab of routerTabs) {
    if (seen.has(tab.page)) continue;
    seen.add(tab.page);
    scans.push(await safeScanPage(client, tab, options.includeParsed === true));
    if (options.delayMs > 0) await sleep(options.delayMs);
  }

  return scans;
}

async function safeScanPage(client: BGW320Client, tab: RouterTab, includeParsed: boolean): Promise<PageScan> {
  try {
    return await scanPage(client, tab, includeParsed);
  } catch (error) {
    return {
      section: tab.section,
      label: tab.label,
      page: tab.page,
      dangerous: tab.dangerous === true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function scanPage(client: BGW320Client, tab: RouterTab, includeParsed: boolean): Promise<PageScan> {
  if (tab.page === "devices") {
    const result = await fetchDeviceList(client);
    return {
      section: tab.section,
      label: tab.label,
      page: tab.page,
      dangerous: tab.dangerous === true,
      ok: result.devices.length > 0,
      fallback: result.fallback,
      title: result.fallback ? "Device List fallback" : "Device List",
      tableRows: result.devices.length,
      valueCount: 0,
      fieldCount: 0,
      selectCount: 0,
      textareaCount: 0,
      buttonCount: 0,
      formCount: 0,
      dataCount: result.devices.length,
      ...(result.error ? { error: result.error } : {}),
    };
  }

  if (tab.page === "home") {
    const status = await fetchDeviceStatus(client);
    if (status.fallback) {
      const sectionDataCount = status.sections.reduce((total, section) => total + Object.keys(section.values).length + section.tables.length, 0);
      return {
        section: tab.section,
        label: tab.label,
        page: tab.page,
        dangerous: tab.dangerous === true,
        ok: status.sections.some((section) => section.ok),
        fallback: true,
        error: status.error ?? "home.ha did not return.",
        title: "Device Status fallback",
        valueCount: status.sections.reduce((total, section) => total + Object.keys(section.values).length, 0),
        tableRows: status.sections.reduce((total, section) => total + section.tables.length, 0),
        fieldCount: 0,
        selectCount: 0,
        textareaCount: 0,
        buttonCount: 0,
        formCount: 0,
        dataCount: sectionDataCount,
      };
    }

    if (status.parsed) {
      return scanFromParsed(tab, status.parsed, status.statusCode, includeParsed);
    }
  }

  if (tab.page === "lanstatistics") {
    const status = await fetchHomeNetworkStatus(client);
    if (status.fallback) {
      const sectionDataCount = status.sections.reduce((total, section) => total + Object.keys(section.values).length + section.tables.length, 0);
      return {
        section: tab.section,
        label: tab.label,
        page: tab.page,
        dangerous: tab.dangerous === true,
        ok: status.sections.some((section) => section.ok),
        fallback: true,
        error: status.error ?? "lanstatistics.ha did not return.",
        title: "Home Network Status fallback",
        valueCount: status.sections.reduce((total, section) => total + Object.keys(section.values).length, 0),
        tableRows: status.sections.reduce((total, section) => total + section.tables.length, 0),
        fieldCount: 0,
        selectCount: 0,
        textareaCount: 0,
        buttonCount: 0,
        formCount: 0,
        dataCount: sectionDataCount,
      };
    }

    if (status.parsed) {
      return scanFromParsed(tab, status.parsed, status.statusCode, includeParsed);
    }
  }

  if (tab.page === "securityoptions") {
    const status = await fetchSecurityOptions(client);
    if (status.fallback) {
      const sectionDataCount = status.sections.reduce((total, section) => total + Object.keys(section.values).length + section.tables.length, 0);
      return {
        section: tab.section,
        label: tab.label,
        page: tab.page,
        dangerous: tab.dangerous === true,
        ok: status.sections.some((section) => section.ok),
        fallback: true,
        error: status.error ?? "securityoptions.ha did not return.",
        title: "Security Options fallback",
        valueCount: status.sections.reduce((total, section) => total + Object.keys(section.values).length, 0),
        tableRows: status.sections.reduce((total, section) => total + section.tables.length, 0),
        fieldCount: 0,
        selectCount: 0,
        textareaCount: 0,
        buttonCount: 0,
        formCount: 0,
        dataCount: sectionDataCount,
      };
    }

    if (status.parsed) {
      return scanFromParsed(tab, status.parsed, status.statusCode, includeParsed);
    }
  }

  const result = await fetchParsedPage(client, tab.page);
  if (result.ok && result.parsed) {
    return scanFromParsed(tab, result.parsed, result.statusCode, includeParsed);
  }

  return {
    section: tab.section,
    label: tab.label,
    page: tab.page,
    dangerous: tab.dangerous === true,
    ok: false,
    error: result.error ?? "Router returned an unusable response.",
  };
}

function scanFromParsed(tab: RouterTab, parsed: ParsedPage, statusCode: number | undefined, includeParsed: boolean): PageScan {
  return {
    section: tab.section,
    label: tab.label,
    page: tab.page,
    dangerous: tab.dangerous === true,
    ok: statusCode === undefined || (statusCode >= 200 && statusCode < 400),
    title: parsed.title,
    heading: parsed.heading,
    valueCount: Object.keys(parsed.values).length,
    tableRows: parsed.tables.length,
    fieldCount: parsed.fields.length,
    selectCount: parsed.selects.length,
    textareaCount: parsed.textareas.length,
    buttonCount: parsed.buttons.length,
    formCount: parsed.forms.length,
    dataCount: parsedDataCount(parsed),
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(includeParsed ? { parsed } : {}),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
