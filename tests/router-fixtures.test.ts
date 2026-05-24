import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { parsedDataCount } from "../src/fetch.js";
import { parsePage } from "../src/parser.js";
import { routerTabs } from "../src/pages.js";
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

const fixtureRoot = join(process.cwd(), "tests", "fixtures");
const htmlDir = join(fixtureRoot, "router-html");
const parsedDir = join(fixtureRoot, "parsed");
const expectedDir = join(fixtureRoot, "expected");
const mappedPages = [...new Set(routerTabs.map((tab) => tab.page))].sort();
const fixturePackComplete = hasCompleteFixturePack();

test("router fixture pack covers every mapped page", () => {
  if (!fixturePackComplete) {
    process.stdout.write("router fixture pack not present; run `bun run fixtures:capture` with BGW_ACCESS_CODE when the router session pool is available\n");
    return;
  }

  expect(existsSync(htmlDir)).toBe(true);
  expect(existsSync(parsedDir)).toBe(true);
  expect(existsSync(expectedDir)).toBe(true);

  const htmlPages = fixturePages(htmlDir, ".html");
  const parsedPages = fixturePages(parsedDir, ".json");
  const expectedPages = fixturePages(expectedDir, ".json");

  expect(htmlPages).toEqual(mappedPages);
  expect(parsedPages).toEqual(mappedPages);
  expect(expectedPages).toEqual(mappedPages);
});

for (const page of fixturePackComplete ? mappedPages : []) {
  test(`router fixture parses ${page}`, () => {
    const html = readFileSync(join(htmlDir, `${page}.html`), "utf8");
    const parsed = parsePage(page, html);
    const savedParsed = readJson<ParsedPage>(join(parsedDir, `${page}.json`));
    const expected = readJson<ExpectedFixture>(join(expectedDir, `${page}.json`));

    expect(parsed).toEqual(savedParsed);
    expect(expected.page).toBe(page);
    expect(parsedDataCount(parsed) > 0).toBe(expected.dataObtainable);
    expect(hasUsefulFields(parsed)).toBe(expected.usefulFieldsExist);
    expect(hasUsefulTables(parsed)).toBe(expected.usefulTablesExist);
    expect(parsed.buttons.length > 0).toBe(expected.buttonsDiscovered);
    expect(parsed.forms.length > 0).toBe(expected.formsDiscovered);
    expect(expected.secretsRedacted).toBe(true);
    if (expected.pageLoads) {
      expect(expected.notOnlyJunk).toBe(parsedDataCount(parsed) > 0);
    } else {
      expect(expected.notOnlyJunk).toBe(false);
    }
    expect(expected.counts).toEqual({
      values: Object.keys(parsed.values).length,
      tables: parsed.tables.length,
      fields: parsed.fields.length,
      selects: parsed.selects.length,
      textareas: parsed.textareas.length,
      buttons: parsed.buttons.length,
      forms: parsed.forms.length,
    });
    expect(expected.valueKeys).toEqual(Object.keys(parsed.values).sort());
    expect(expected.tableColumns).toEqual([...new Set(parsed.tables.flatMap((row) => Object.keys(row)))].sort());
    expect(expected.fieldNames).toEqual(parsed.fields.map((field) => field.name).sort());
    expect(expected.selectNames).toEqual(parsed.selects.map((select) => select.name).sort());
    expect(expected.textareaNames).toEqual(parsed.textareas.map((textarea) => textarea.name).sort());
    expect(expected.buttonNames).toEqual(parsed.buttons.map((button) => button.name).sort());
    expect(expected.formActions).toEqual([...new Set(parsed.forms.map((form) => form.action))].sort());
    expect(JSON.stringify(parsed)).not.toMatch(/65454<98@1|\b[a-f0-9]{32}\b|\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/i);
  });
}

function fixturePages(dir: string, extension: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(extension))
    .map((file) => file.slice(0, -extension.length))
    .sort();
}

function hasCompleteFixturePack(): boolean {
  if (!existsSync(htmlDir) || !existsSync(parsedDir) || !existsSync(expectedDir)) return false;
  return fixturePages(htmlDir, ".html").length === mappedPages.length
    && fixturePages(parsedDir, ".json").length === mappedPages.length
    && fixturePages(expectedDir, ".json").length === mappedPages.length;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function hasUsefulFields(parsed: ParsedPage): boolean {
  return parsed.fields.some((field) => field.name !== "nonce" && field.name !== "hashpassword");
}

function hasUsefulTables(parsed: ParsedPage): boolean {
  return parsed.tables.length > 0 && new Set(parsed.tables.flatMap((row) => Object.keys(row))).size > 0;
}
