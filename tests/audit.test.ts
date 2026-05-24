import { expect, test } from "bun:test";
import { buildAudit } from "../src/audit.js";
import type { PageScan } from "../src/scan.js";
import { fetchParsedPage } from "../src/fetch.js";
import { fetchSecurityOptions } from "../src/status.js";

test("buildAudit classifies failed, fallback, useful, and empty pages", () => {
  const scans: PageScan[] = [
    scan({
      section: "Device",
      label: "Status",
      page: "home",
      dangerous: false,
      ok: true,
      fallback: true,
      dataCount: 12,
    }),
    scan({
      section: "Diagnostics",
      label: "Update",
      page: "update",
      dangerous: true,
      ok: true,
      dataCount: 0,
    }),
    scan({
      section: "Voice",
      label: "Call Statistics",
      page: "voicestat",
      dangerous: false,
      ok: false,
      error: "Timed out",
    }),
  ];

  expect(buildAudit(scans)).toMatchObject({
    totalPages: 3,
    okPages: 2,
    failedPages: 1,
    fallbackPages: 1,
    usefulPages: 1,
    emptyPages: 1,
    dangerousPages: 1,
  });
});

function scan(overrides: Partial<PageScan>): PageScan {
  const dataCount = overrides.dataCount ?? 0;
  return {
    section: "Device",
    label: "Status",
    page: "home",
    dangerous: false,
    guarded: false,
    ok: false,
    valueCount: 0,
    tableRows: 0,
    fieldCount: 0,
    selectCount: 0,
    textareaCount: 0,
    buttonCount: 0,
    formCount: 0,
    dataCount,
    dataObtainable: dataCount > 0,
    useful: overrides.ok === true && dataCount > 0,
    notOnlyJunk: overrides.ok === true && dataCount > 0,
    ...overrides,
  };
}

test("fetchSecurityOptions falls back when firmware advertises a missing page", async () => {
  const client = {
    getCgiPage: async (page: string) => {
      if (page === "securityoptions") {
        return {
          statusCode: 200,
          statusMessage: "OK",
          headers: {},
          body: "<title>Page not found</title><h1>Page not found.</h1>",
          url: "https://router/cgi-bin/securityoptions.ha",
        };
      }
      return {
        statusCode: 200,
        statusMessage: "OK",
        headers: {},
        body: `<title>${page}</title><table><tr><td>Firewall Advanced</td><td>On</td></tr></table>`,
        url: `https://router/cgi-bin/${page}.ha`,
      };
    },
  };

  const result = await fetchSecurityOptions(client as never);
  expect(result).toMatchObject({
    page: "securityoptions",
    fallback: true,
    error: "Page not found.",
  });
  expect(result.sections.map((section) => section.page)).toEqual(["firewall", "dosprotect"]);
  expect(result.sections.every((section) => section.ok)).toBe(true);
});

test("fetchParsedPage treats router Page not found HTML as unavailable", async () => {
  const client = {
    getCgiPage: async () => ({
      statusCode: 200,
      statusMessage: "OK",
      headers: {},
      body: "<title>Page not found</title><h1>Page not found.</h1>",
      url: "https://router/cgi-bin/securityoptions.ha",
    }),
  };

  const result = await fetchParsedPage(client as never, "securityoptions");
  expect(result).toMatchObject({
    page: "securityoptions",
    ok: false,
    statusCode: 200,
    error: "Page not found.",
  });
});

test("fetchParsedPage treats leaked login HTML as unavailable", async () => {
  const client = {
    getCgiPage: async () => ({
      statusCode: 200,
      statusMessage: "OK",
      headers: {},
      body: `<title>Login</title><form><input id="password" name="password"></form>`,
      url: "https://router/cgi-bin/broadbandconfig.ha",
    }),
  };

  const result = await fetchParsedPage(client as never, "broadbandconfig");
  expect(result).toMatchObject({
    page: "broadbandconfig",
    ok: false,
    statusCode: 200,
    error: "Router returned the login page instead of the requested page.",
  });
});
