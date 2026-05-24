import { BGW320Client } from "./client.js";
import { fetchParsedPage, parsedDataCount, type ParsedPageResult } from "./fetch.js";
import type { ParsedPage } from "./types.js";

export type StatusSection = {
  page: string;
  ok: boolean;
  title?: string;
  heading?: string;
  values: Record<string, string>;
  tables: Record<string, string>[];
  error?: string;
};

export type DeviceStatusResult = {
  page: "home";
  fallback: boolean;
  statusCode?: number;
  title?: string;
  parsed?: ParsedPage;
  error?: string;
  sections: StatusSection[];
};

export type CompositeStatusResult = {
  page: string;
  fallback: boolean;
  statusCode?: number;
  title?: string;
  parsed?: ParsedPage;
  error?: string;
  sections: StatusSection[];
};

const fallbackDeviceStatusPages = ["sysinfo", "broadbandstatistics", "firewall"] as const;
const fallbackStatusPages = ["sysinfo", "broadbandstatistics", "fiberstat", "firewall"] as const;
const fallbackHomeNetworkPages = ["etherlan", "dhcpserver", "ipalloc", "wconfig_unified"] as const;
const fallbackSecurityOptionsPages = ["firewall", "dosprotect"] as const;

export async function fetchDeviceStatus(client: BGW320Client, options: { includeSecrets?: boolean } = {}): Promise<DeviceStatusResult> {
  const result = await fetchParsedPageSoft(client, "home", options);
  if (result.ok && result.parsed && parsedDataCount(result.parsed) > 0) {
    const parsed = result.parsed;
    return {
      page: "home",
      fallback: false,
      title: parsed.title,
      parsed,
      ...(result.statusCode !== undefined ? { statusCode: result.statusCode } : {}),
      sections: [{
        page: "home",
        ok: true,
        title: parsed.title,
        heading: parsed.heading,
        values: parsed.values,
        tables: parsed.tables,
      }],
    };
  }

  return {
    page: "home",
    fallback: true,
    error: result.error ?? "Router returned an unusable response.",
    sections: await fetchSections(client, fallbackDeviceStatusPages, options),
  };
}

export async function fetchStatusSections(client: BGW320Client, options: { includeSecrets?: boolean } = {}): Promise<StatusSection[]> {
  const sections: StatusSection[] = [];

  for (const page of fallbackStatusPages) {
    const result = await fetchParsedPageSoft(client, page, options);
    if (result.ok && result.parsed) {
      const parsed = result.parsed;
      sections.push({
        page,
        ok: true,
        title: parsed.title,
        heading: parsed.heading,
        values: parsed.values,
        tables: parsed.tables,
      });
    } else {
      sections.push({
        page,
        ok: false,
        values: {},
        tables: [],
        error: result.error ?? "Router returned an unusable response.",
      });
    }
  }

  return sections;
}

export async function fetchHomeNetworkStatus(client: BGW320Client, options: { includeSecrets?: boolean } = {}): Promise<CompositeStatusResult> {
  const result = await fetchParsedPageSoft(client, "lanstatistics", options);
  if (result.ok && result.parsed && parsedDataCount(result.parsed) > 0) {
    const parsed = result.parsed;
    return {
      page: "lanstatistics",
      fallback: false,
      title: parsed.title,
      parsed,
      ...(result.statusCode !== undefined ? { statusCode: result.statusCode } : {}),
      sections: [{
        page: "lanstatistics",
        ok: true,
        title: parsed.title,
        heading: parsed.heading,
        values: parsed.values,
        tables: parsed.tables,
      }],
    };
  }

  return {
    page: "lanstatistics",
    fallback: true,
    error: result.error ?? "Router returned an unusable response.",
    sections: await fetchSections(client, fallbackHomeNetworkPages, options),
  };
}

export async function fetchSecurityOptions(client: BGW320Client, options: { includeSecrets?: boolean } = {}): Promise<CompositeStatusResult> {
  const result = await fetchParsedPageSoft(client, "securityoptions", options);
  if (result.ok && result.parsed && parsedDataCount(result.parsed) > 0) {
    const parsed = result.parsed;
    return {
      page: "securityoptions",
      fallback: false,
      title: parsed.title,
      parsed,
      ...(result.statusCode !== undefined ? { statusCode: result.statusCode } : {}),
      sections: [{
        page: "securityoptions",
        ok: true,
        title: parsed.title,
        heading: parsed.heading,
        values: parsed.values,
        tables: parsed.tables,
      }],
    };
  }

  return {
    page: "securityoptions",
    fallback: true,
    error: result.error ?? "Router returned an unusable response.",
    sections: await fetchSections(client, fallbackSecurityOptionsPages, options),
  };
}

async function fetchSections(client: BGW320Client, pages: readonly string[], options: { includeSecrets?: boolean }): Promise<StatusSection[]> {
  const sections: StatusSection[] = [];
  for (const page of pages) {
    const result = await fetchParsedPageSoft(client, page, options);
    if (result.ok && result.parsed) {
      const parsed = result.parsed;
      sections.push({
        page,
        ok: true,
        title: parsed.title,
        heading: parsed.heading,
        values: parsed.values,
        tables: parsed.tables,
      });
    } else {
      sections.push({
        page,
        ok: false,
        values: {},
        tables: [],
        error: result.error ?? "Router returned an unusable response.",
      });
    }
  }
  return sections;
}

async function fetchParsedPageSoft(client: BGW320Client, page: string, options: { includeSecrets?: boolean }): Promise<ParsedPageResult> {
  try {
    return await fetchParsedPage(client, page, options);
  } catch (error) {
    return {
      page,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
