import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RouterSessionPoolFullError, type BGW320Client } from "./client.js";
import { fetchDeviceList } from "./devices.js";
import { fetchParsedPage, parsedDataCount } from "./fetch.js";
import { parsePage } from "./parser.js";
import { resolvePage, routerTabs, type RouterTab } from "./pages.js";
import { fetchDeviceStatus, fetchHomeNetworkStatus, fetchSecurityOptions, type StatusSection } from "./status.js";
import type { Device, ParsedButton, ParsedField, ParsedForm, ParsedPage, ParsedSelect, ParsedTextarea } from "./types.js";

export type SweepControlDetails = {
  fields: ParsedField[];
  selects: ParsedSelect[];
  textareas: ParsedTextarea[];
  buttons: ParsedButton[];
  forms: ParsedForm[];
};

export type SweepPage = {
  section: string;
  label: string;
  page: string;
  dangerous: boolean;
  guarded: boolean;
  ok: boolean;
  fallback?: boolean;
  statusCode?: number;
  error?: string;
  title?: string;
  heading?: string;
  valueCount: number;
  tableRows: number;
  fieldCount: number;
  selectCount: number;
  textareaCount: number;
  buttonCount: number;
  formCount: number;
  dataCount: number;
  dataObtainable: boolean;
  useful: boolean;
  notOnlyJunk: boolean;
  sessionPoolFull?: boolean;
  waitedMs?: number;
  retryCount?: number;
  rawHtml?: string;
  parsed?: ParsedPage;
  controls?: SweepControlDetails;
  fallbackSections?: StatusSection[];
  devices?: Device[];
  artifacts?: {
    html?: string;
    parsed?: string;
  };
};

export type SweepOptions = {
  delayMs: number;
  pages?: string[] | undefined;
  includeParsed?: boolean | undefined;
  includeForms?: boolean | undefined;
  includeRaw?: boolean | undefined;
  useFallbacks?: boolean | undefined;
  includeSecrets?: boolean | undefined;
};

export async function sweepRouter(client: BGW320Client, options: SweepOptions): Promise<SweepPage[]> {
  const pages: SweepPage[] = [];
  const tabs = sweepTabs(options.pages);

  for (const tab of tabs) {
    pages.push(await safeSweepPage(client, tab, options));
    if (options.delayMs > 0) await sleep(options.delayMs);
  }

  return pages;
}

export async function writeSweepArtifacts(pages: SweepPage[], outDir: string): Promise<SweepPage[]> {
  const htmlDir = join(outDir, "router-html");
  const parsedDir = join(outDir, "parsed");
  await mkdir(htmlDir, { recursive: true });
  await mkdir(parsedDir, { recursive: true });

  const withArtifacts: SweepPage[] = [];
  for (const page of pages) {
    const artifacts: SweepPage["artifacts"] = {};
    if (page.rawHtml !== undefined) {
      const htmlPath = join(htmlDir, `${page.page}.html`);
      await writeFile(htmlPath, `${page.rawHtml.trimEnd()}\n`);
      artifacts.html = htmlPath;
    }
    if (page.parsed) {
      const parsedPath = join(parsedDir, `${page.page}.json`);
      await writeFile(parsedPath, `${JSON.stringify(page.parsed, null, 2)}\n`);
      artifacts.parsed = parsedPath;
    }
    withArtifacts.push(stripLargePayloads({ ...page, ...(Object.keys(artifacts).length > 0 ? { artifacts } : {}) }));
  }

  await writeFile(join(outDir, "sweep.json"), `${JSON.stringify(withArtifacts, null, 2)}\n`);
  return withArtifacts;
}

export function stripLargePayloads(page: SweepPage): SweepPage {
  const { rawHtml: _rawHtml, parsed: _parsed, controls: _controls, ...compact } = page;
  return compact;
}

function sweepTabs(pages: string[] | undefined): RouterTab[] {
  const uniqueTabs = dedupeTabs(routerTabs);
  if (!pages || pages.length === 0) return uniqueTabs;

  const selected = new Set(pages.map((page) => resolvePage(page.trim())).filter(Boolean));
  const tabs = uniqueTabs.filter((tab) => selected.has(tab.page));
  const known = new Set(tabs.map((tab) => tab.page));
  const unknown = [...selected].filter((page) => !known.has(page));
  if (unknown.length > 0) {
    throw new Error(`Unknown sweep page(s): ${unknown.join(", ")}`);
  }
  return tabs;
}

function dedupeTabs(tabs: RouterTab[]): RouterTab[] {
  const seen = new Set<string>();
  const unique: RouterTab[] = [];
  for (const tab of tabs) {
    if (seen.has(tab.page)) continue;
    seen.add(tab.page);
    unique.push(tab);
  }
  return unique;
}

async function safeSweepPage(client: BGW320Client, tab: RouterTab, options: SweepOptions): Promise<SweepPage> {
  try {
    return await sweepPage(client, tab, options);
  } catch (error) {
    return failurePage(tab, error);
  }
}

async function sweepPage(client: BGW320Client, tab: RouterTab, options: SweepOptions): Promise<SweepPage> {
  const useFallbacks = options.useFallbacks !== false && options.includeRaw !== true;

  if (useFallbacks) {
    const fallback = await fallbackPage(client, tab, options);
    if (fallback) return fallback;
  }

  const response = tab.page === "sitemap"
    ? await client.getCgiPage(tab.page, { auth: false })
    : await client.getCgiPage(tab.page);
  const parsed = parsePage(tab.page, response.body, { includeSecrets: options.includeSecrets === true });
  return pageFromParsed(tab, parsed, {
    statusCode: response.statusCode,
    ok: response.statusCode >= 200 && response.statusCode < 400 && !isJunkOnly(parsed),
    includeParsed: options.includeParsed === true,
    includeForms: options.includeForms === true,
    rawHtml: options.includeRaw === true ? response.body : undefined,
  });
}

async function fallbackPage(client: BGW320Client, tab: RouterTab, options: SweepOptions): Promise<SweepPage | undefined> {
  if (tab.page === "devices") {
    const result = await fetchDeviceList(client);
    return completePage({
      section: tab.section,
      label: tab.label,
      page: tab.page,
      dangerous: tab.dangerous === true,
      guarded: tab.dangerous === true,
      ok: result.devices.length > 0,
      fallback: result.fallback,
      title: result.fallback ? "Device List fallback" : "Device List",
      valueCount: 0,
      tableRows: result.devices.length,
      fieldCount: 0,
      selectCount: 0,
      textareaCount: 0,
      buttonCount: 0,
      formCount: 0,
      dataCount: result.devices.length,
      ...(options.includeParsed === true ? { devices: result.devices } : {}),
      ...(result.error ? { error: result.error } : {}),
    });
  }

  if (tab.page === "home") {
    const status = await fetchDeviceStatus(client, parseOptions(options));
    if (status.fallback) return fallbackStatusPage(tab, "Device Status fallback", status.error, status.sections, options.includeParsed === true);
    if (status.parsed) {
      return pageFromParsed(tab, status.parsed, {
        statusCode: status.statusCode,
        ok: status.statusCode === undefined || (status.statusCode >= 200 && status.statusCode < 400),
        includeParsed: options.includeParsed === true,
        includeForms: options.includeForms === true,
      });
    }
  }

  if (tab.page === "lanstatistics") {
    const status = await fetchHomeNetworkStatus(client, parseOptions(options));
    if (status.fallback) return fallbackStatusPage(tab, "Home Network Status fallback", status.error, status.sections, options.includeParsed === true);
    if (status.parsed) {
      return pageFromParsed(tab, status.parsed, {
        statusCode: status.statusCode,
        ok: status.statusCode === undefined || (status.statusCode >= 200 && status.statusCode < 400),
        includeParsed: options.includeParsed === true,
        includeForms: options.includeForms === true,
      });
    }
  }

  if (tab.page === "securityoptions") {
    const status = await fetchSecurityOptions(client, parseOptions(options));
    if (status.fallback) return fallbackStatusPage(tab, "Security Options fallback", status.error, status.sections, options.includeParsed === true);
    if (status.parsed) {
      return pageFromParsed(tab, status.parsed, {
        statusCode: status.statusCode,
        ok: status.statusCode === undefined || (status.statusCode >= 200 && status.statusCode < 400),
        includeParsed: options.includeParsed === true,
        includeForms: options.includeForms === true,
      });
    }
  }

  const result = await fetchParsedPage(client, tab.page, parseOptions(options));
  if (result.ok && result.parsed) {
    return pageFromParsed(tab, result.parsed, {
      statusCode: result.statusCode,
      ok: true,
      includeParsed: options.includeParsed === true,
      includeForms: options.includeForms === true,
    });
  }

  if (result.parsed) {
    return pageFromParsed(tab, result.parsed, {
      statusCode: result.statusCode,
      ok: false,
      error: result.error ?? "Router returned an unusable response.",
      includeParsed: options.includeParsed === true,
      includeForms: options.includeForms === true,
    });
  }

  return completePage({
    section: tab.section,
    label: tab.label,
    page: tab.page,
    dangerous: tab.dangerous === true,
    guarded: tab.dangerous === true,
    ok: false,
    error: result.error ?? "Router returned an unusable response.",
    valueCount: 0,
    tableRows: 0,
    fieldCount: 0,
    selectCount: 0,
    textareaCount: 0,
    buttonCount: 0,
    formCount: 0,
    dataCount: 0,
  });
}

function fallbackStatusPage(tab: RouterTab, title: string, error: string | undefined, sections: StatusSection[], includeSections: boolean): SweepPage {
  const valueCount = sections.reduce((total, section) => total + Object.keys(section.values).length, 0);
  const tableRows = sections.reduce((total, section) => total + section.tables.length, 0);
  return completePage({
    section: tab.section,
    label: tab.label,
    page: tab.page,
    dangerous: tab.dangerous === true,
    guarded: tab.dangerous === true,
    ok: sections.some((section) => section.ok),
    fallback: true,
    title,
    ...(error ? { error } : {}),
    valueCount,
    tableRows,
    fieldCount: 0,
    selectCount: 0,
    textareaCount: 0,
    buttonCount: 0,
    formCount: 0,
    dataCount: valueCount + tableRows,
    ...(includeSections ? { fallbackSections: sections } : {}),
  });
}

function pageFromParsed(tab: RouterTab, parsed: ParsedPage, options: {
  statusCode?: number | undefined;
  ok: boolean;
  error?: string | undefined;
  includeParsed: boolean;
  includeForms: boolean;
  rawHtml?: string | undefined;
}): SweepPage {
  return completePage({
    section: tab.section,
    label: tab.label,
    page: tab.page,
    dangerous: tab.dangerous === true,
    guarded: tab.dangerous === true,
    ok: options.ok,
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
    ...(options.statusCode !== undefined ? { statusCode: options.statusCode } : {}),
    ...(options.error ? { error: options.error } : {}),
    ...(options.includeParsed ? { parsed } : {}),
    ...(options.includeForms ? { controls: controlsFromParsed(parsed) } : {}),
    ...(options.rawHtml !== undefined ? { rawHtml: options.rawHtml } : {}),
  });
}

function controlsFromParsed(parsed: ParsedPage): SweepControlDetails {
  return {
    fields: parsed.fields,
    selects: parsed.selects,
    textareas: parsed.textareas,
    buttons: parsed.buttons,
    forms: parsed.forms,
  };
}

function parseOptions(options: SweepOptions): { includeSecrets?: boolean } {
  return options.includeSecrets === undefined ? {} : { includeSecrets: options.includeSecrets };
}

function completePage(page: Omit<SweepPage, "dataObtainable" | "useful" | "notOnlyJunk">): SweepPage {
  const dataObtainable = page.dataCount > 0;
  const notOnlyJunk = page.ok && dataObtainable && !isJunkTitle(page.title ?? page.heading ?? "");
  return {
    ...page,
    dataObtainable,
    useful: page.ok && dataObtainable,
    notOnlyJunk,
  };
}

function failurePage(tab: RouterTab, error: unknown): SweepPage {
  const sessionError = error instanceof RouterSessionPoolFullError ? error : undefined;
  return completePage({
    section: tab.section,
    label: tab.label,
    page: tab.page,
    dangerous: tab.dangerous === true,
    guarded: tab.dangerous === true,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    valueCount: 0,
    tableRows: 0,
    fieldCount: 0,
    selectCount: 0,
    textareaCount: 0,
    buttonCount: 0,
    formCount: 0,
    dataCount: 0,
    ...(sessionError ? {
      sessionPoolFull: true,
      waitedMs: sessionError.waitedMs,
      retryCount: sessionError.retryCount,
    } : {}),
  });
}

function isJunkOnly(parsed: ParsedPage): boolean {
  return isJunkTitle(parsed.title || parsed.heading) || parsedDataCount(parsed) === 0;
}

function isJunkTitle(title: string): boolean {
  return /^Login$/i.test(title) || /^Page not found\.?$/i.test(title);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
