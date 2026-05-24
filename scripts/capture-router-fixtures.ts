#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BGW320Client } from "../src/client.js";
import { envDefaultOptions } from "../src/config.js";
import { parsedDataCount } from "../src/fetch.js";
import { parsePage } from "../src/parser.js";
import { routerTabs } from "../src/pages.js";
import { sweepRouter } from "../src/sweep.js";
import type { ParsedPage } from "../src/types.js";

type ExpectedFixture = {
  page: string;
  title: string;
  pageLoads: boolean;
  dataObtainable: boolean;
  usefulFieldsExist: boolean;
  usefulTablesExist: boolean;
  buttonsDiscovered: boolean;
  formsDiscovered: boolean;
  secretsRedacted: boolean;
  notOnlyJunk: boolean;
  counts: {
    values: number;
    tables: number;
    fields: number;
    selects: number;
    textareas: number;
    buttons: number;
    forms: number;
  };
  valueKeys: string[];
  tableColumns: string[];
  fieldNames: string[];
  selectNames: string[];
  textareaNames: string[];
  buttonNames: string[];
  formActions: string[];
};

const root = new URL("..", import.meta.url).pathname;
const fixtureRoot = join(root, "tests", "fixtures");
const htmlDir = join(fixtureRoot, "router-html");
const parsedDir = join(fixtureRoot, "parsed");
const expectedDir = join(fixtureRoot, "expected");
const delayMs = Number(process.env.BGW_FIXTURE_DELAY_MS || 750);
const options = envDefaultOptions();
const accessCode = process.env.BGW_ACCESS_CODE;

if (!accessCode) {
  throw new Error("Set BGW_ACCESS_CODE to capture authenticated router fixtures.");
}

await mkdir(htmlDir, { recursive: true });
await mkdir(parsedDir, { recursive: true });
await mkdir(expectedDir, { recursive: true });

const client = new BGW320Client({
  host: options.host,
  accessCode,
  timeoutMs: options.timeoutMs,
  insecureTls: options.insecureTls,
  waitForSession: options.waitForSession,
  sessionWaitTimeoutMs: options.sessionWaitTimeoutMs,
  sessionWaitIntervalMs: options.sessionWaitIntervalMs,
  userAgent: "bgw-fixture-capture/0.1.0",
});

const allPages = [...new Set(routerTabs.map((tab) => tab.page))].sort();
const requestedPages = process.env.BGW_FIXTURE_PAGES
  ?.split(",")
  .map((page) => page.trim())
  .filter(Boolean);
const pages = requestedPages?.length ? requestedPages : allPages;
let captured = 0;

const sweep = await sweepRouter(client, {
  delayMs,
  pages,
  includeRaw: true,
  includeParsed: true,
  includeSecrets: false,
  useFallbacks: false,
});

for (const pageResult of sweep) {
  const page = pageResult.page;
  process.stdout.write(`capturing ${page}... `);
  if (pageResult.rawHtml) {
    const html = sanitizeRouterText(pageResult.rawHtml);
    const parsed = parsePage(page, html);
    const expected = expectedFor(page, parsed, pageResult.ok && !isJunkOnly(parsed));
    await writeFixtureSet(page, html, parsed, pageResult.error ? { ...expected, error: sanitizeRouterText(pageResult.error) } : expected);
    captured += 1;
    process.stdout.write(pageResult.ok ? "ok\n" : `captured error page: ${pageResult.error ?? "unusable response"}\n`);
  } else {
    const message = pageResult.error ?? "Router did not return page HTML.";
    process.stdout.write(`failed: ${message}\n`);
    const html = `<!-- bgw fixture capture failed for ${page}: ${sanitizeRouterText(message)} -->\n`;
    const parsed = parsePage(page, html);
    const expected = expectedFor(page, parsed, false);
    await writeFixtureSet(page, html, parsed, { ...expected, error: sanitizeRouterText(message) });
  }
}

process.stdout.write(`captured ${captured}/${pages.length} router pages\n`);

function expectedFor(page: string, parsed: ParsedPage, pageLoads: boolean): ExpectedFixture {
  const dataCount = parsedDataCount(parsed);
  const tableColumns = [...new Set(parsed.tables.flatMap((row) => Object.keys(row)))].sort();
  const serialized = JSON.stringify(parsed);
  return {
    page,
    title: parsed.title,
    pageLoads,
    dataObtainable: dataCount > 0,
    usefulFieldsExist: parsed.fields.some((field) => field.name !== "nonce" && field.name !== "hashpassword"),
    usefulTablesExist: parsed.tables.length > 0 && tableColumns.length > 0,
    buttonsDiscovered: parsed.buttons.length > 0,
    formsDiscovered: parsed.forms.length > 0,
    secretsRedacted: !containsSensitiveFixtureValue(serialized),
    notOnlyJunk: dataCount > 0 && !isJunkOnly(parsed),
    counts: {
      values: Object.keys(parsed.values).length,
      tables: parsed.tables.length,
      fields: parsed.fields.length,
      selects: parsed.selects.length,
      textareas: parsed.textareas.length,
      buttons: parsed.buttons.length,
      forms: parsed.forms.length,
    },
    valueKeys: Object.keys(parsed.values).sort(),
    tableColumns,
    fieldNames: parsed.fields.map((field) => field.name).sort(),
    selectNames: parsed.selects.map((select) => select.name).sort(),
    textareaNames: parsed.textareas.map((textarea) => textarea.name).sort(),
    buttonNames: parsed.buttons.map((button) => button.name).sort(),
    formActions: [...new Set(parsed.forms.map((form) => form.action))].sort(),
  };
}

async function writeFixtureSet(page: string, html: string, parsed: ParsedPage, expected: ExpectedFixture & { error?: string }): Promise<void> {
  await writeFile(join(htmlDir, `${page}.html`), `${html.trimEnd()}\n`);
  await writeFile(join(parsedDir, `${page}.json`), `${JSON.stringify(parsed, null, 2)}\n`);
  await writeFile(join(expectedDir, `${page}.json`), `${JSON.stringify(expected, null, 2)}\n`);
}

function isJunkOnly(parsed: ParsedPage): boolean {
  const title = parsed.title || parsed.heading;
  if (/^Login$/i.test(title)) return true;
  if (/^Page not found\.?$/i.test(title)) return true;
  return parsedDataCount(parsed) === 0;
}

function sanitizeRouterText(value: string): string {
  return value
    .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, "[redacted-mac]")
    .replace(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, "[redacted-ip]")
    .replace(/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, "[redacted-ipv6]")
    .replace(/\b(?=[0-9a-f:]*::)(?:[0-9a-f]{0,4}:){1,7}[0-9a-f]{0,4}\b/gi, "[redacted-ipv6]")
    .replace(/(name=["'](?:nonce|hashpassword|password|.*?pass.*?|.*?key.*?)["'][^>]*value=["'])[^"']*(["'])/gi, "$1[redacted]$2")
    .replace(/(value=["'])[^"']*(["'][^>]*name=["'](?:nonce|hashpassword|password|.*?pass.*?|.*?key.*?)["'])/gi, "$1[redacted]$2");
}

function containsSensitiveFixtureValue(value: string): boolean {
  return /65454<98@1/i.test(value)
    || /\b[a-f0-9]{32}\b/i.test(value)
    || /\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/i.test(value);
}
