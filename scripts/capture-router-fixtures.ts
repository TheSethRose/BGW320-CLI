#!/usr/bin/env bun
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BGW320Client } from "../src/client.js";
import { envDefaultOptions } from "../src/config.js";
import { parsedDataCount } from "../src/fetch.js";
import { containsSensitiveFixtureValue, sanitizeRouterFixture } from "../src/fixture-sanitize.js";
import { parsePage } from "../src/parser.js";
import { routerTabs } from "../src/pages.js";
import { withRouterSession } from "../src/session.js";
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
    valueEntries: number;
    tables: number;
    fields: number;
    selects: number;
    textareas: number;
    buttons: number;
    forms: number;
    links: number;
  };
  valueKeys: string[];
  tableColumns: string[];
  fieldNames: string[];
  selectNames: string[];
  textareaNames: string[];
  buttonNames: string[];
  formActions: string[];
  linkTargets: string[];
  valueEntryLabels: string[];
};

const root = new URL("..", import.meta.url).pathname;
const fixtureRoot = join(root, "tests", "fixtures");
const htmlDir = join(fixtureRoot, "router-html");
const parsedDir = join(fixtureRoot, "parsed");
const expectedDir = join(fixtureRoot, "expected");
const requestedDelayMs = Number(process.env.BGW_FIXTURE_DELAY_MS || 750);
const delayMs = Number.isFinite(requestedDelayMs) ? Math.max(750, requestedDelayMs) : 750;
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
  waitForSession: false,
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

const sweep = await withRouterSession(client, {
  cacheTtlMs: options.sessionCacheTtlMs,
  poolCooldownMs: options.sessionPoolCooldownMs,
  lockTimeoutMs: options.sessionLockTimeoutMs,
  waitForSession: false,
}, () => sweepRouter(client, {
  delayMs,
  pages,
  includeRaw: true,
  includeParsed: true,
  includeSecrets: false,
  useFallbacks: false,
}));

for (const pageResult of sweep) {
  const page = pageResult.page;
  process.stdout.write(`capturing ${page}... `);
  if (pageResult.rawHtml) {
    const html = sanitizeRouterFixture(pageResult.rawHtml);
    const parsed = parsePage(page, html);
    assertFixtureSafe(html, parsed);
    const expected = expectedFor(page, parsed, pageResult.ok && !isJunkOnly(parsed));
    await writeFixtureSet(page, html, parsed, pageResult.error ? { ...expected, error: sanitizeRouterFixture(pageResult.error) } : expected);
    captured += 1;
    process.stdout.write(pageResult.ok ? "ok\n" : `captured error page: ${pageResult.error ?? "unusable response"}\n`);
  } else {
    const message = pageResult.error ?? "Router did not return page HTML.";
    process.stdout.write(`failed: ${message}\n`);
    const html = `<!-- bgw fixture capture failed for ${page}: ${sanitizeRouterFixture(message)} -->\n`;
    const parsed = parsePage(page, html);
    const expected = expectedFor(page, parsed, false);
    await writeFixtureSet(page, html, parsed, { ...expected, error: sanitizeRouterFixture(message) });
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
      valueEntries: parsed.valueEntries?.length ?? 0,
      tables: parsed.tables.length,
      fields: parsed.fields.length,
      selects: parsed.selects.length,
      textareas: parsed.textareas.length,
      buttons: parsed.buttons.length,
      forms: parsed.forms.length,
      links: parsed.links?.length ?? 0,
    },
    valueKeys: Object.keys(parsed.values).sort(),
    tableColumns,
    fieldNames: parsed.fields.map((field) => field.name).sort(),
    selectNames: parsed.selects.map((select) => select.name).sort(),
    textareaNames: parsed.textareas.map((textarea) => textarea.name).sort(),
    buttonNames: parsed.buttons.map((button) => button.name).sort(),
    formActions: [...new Set(parsed.forms.map((form) => form.action))].sort(),
    linkTargets: [...new Set(parsed.links?.map((link) => link.href) ?? [])].sort(),
    valueEntryLabels: [...new Set(parsed.valueEntries?.map((entry) => entry.label) ?? [])].sort(),
  };
}

async function writeFixtureSet(page: string, html: string, parsed: ParsedPage, expected: ExpectedFixture & { error?: string }): Promise<void> {
  const paths = [
    join(htmlDir, `${page}.html`),
    join(parsedDir, `${page}.json`),
    join(expectedDir, `${page}.json`),
  ];
  await writeFile(paths[0]!, `${html.trimEnd()}\n`, { mode: 0o600 });
  await writeFile(paths[1]!, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  await writeFile(paths[2]!, `${JSON.stringify(expected, null, 2)}\n`, { mode: 0o600 });
  await Promise.all(paths.map((path) => chmod(path, 0o600)));
}

function isJunkOnly(parsed: ParsedPage): boolean {
  const title = parsed.title || parsed.heading;
  if (/^Login$/i.test(title)) return true;
  if (/^Page not found\.?$/i.test(title)) return true;
  return parsedDataCount(parsed) === 0;
}

function assertFixtureSafe(html: string, parsed: ParsedPage): void {
  if (containsSensitiveFixtureValue(html) || containsSensitiveFixtureValue(JSON.stringify(parsed))) {
    throw new Error(`Refusing to write ${parsed.page} because sensitive fixture data remains after sanitization.`);
  }
}
