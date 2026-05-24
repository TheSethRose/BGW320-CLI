import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
import { scanRouter } from "../src/scan.js";
import { sweepRouter } from "../src/sweep.js";

test("sweep engine walks selected pages in router-tab order", async () => {
  const client = fakeClient();

  const pages = await sweepRouter(client as never, {
    delayMs: 0,
    pages: ["diag", "wconfig_unified", "dhcpserver"],
    useFallbacks: false,
  });

  expect(pages.map((page) => page.page)).toEqual(["wconfig_unified", "dhcpserver", "diag"]);
  expect(client.calls).toEqual(["wconfig_unified", "dhcpserver", "diag"]);
});

test("sweep continues after per-page failure", async () => {
  const client = fakeClient({ failPages: new Set(["dhcpserver"]) });

  const pages = await sweepRouter(client as never, {
    delayMs: 0,
    pages: ["dhcpserver", "diag"],
    useFallbacks: false,
  });

  expect(pages.map((page) => ({ page: page.page, ok: page.ok }))).toEqual([
    { page: "dhcpserver", ok: false },
    { page: "diag", ok: true },
  ]);
  expect(pages[0]?.error).toContain("boom");
});

test("sweep default result is compact and parsed data is opt-in", async () => {
  const compact = await sweepRouter(fakeClient() as never, {
    delayMs: 0,
    pages: ["diag"],
    useFallbacks: false,
  });

  expect(compact[0]).toMatchObject({
    page: "diag",
    ok: true,
    valueCount: 2,
    tableRows: 0,
    fieldCount: 2,
    buttonCount: 1,
    formCount: 1,
    dataObtainable: true,
    useful: true,
    notOnlyJunk: true,
  });
  expect(compact[0]).not.toHaveProperty("parsed");
  expect(compact[0]).not.toHaveProperty("rawHtml");
  expect(compact[0]).not.toHaveProperty("controls");

  const detailed = await sweepRouter(fakeClient() as never, {
    delayMs: 0,
    pages: ["diag"],
    includeParsed: true,
    includeForms: true,
    includeRaw: true,
    useFallbacks: false,
  });

  expect(detailed[0]?.parsed?.page).toBe("diag");
  expect(detailed[0]?.rawHtml).toContain("<title>diag</title>");
  expect(detailed[0]?.controls?.buttons.map((button) => button.name)).toEqual(["Ping"]);
});

test("sweep exposes fallback section data only with parsed detail", async () => {
  const compact = await sweepRouter(fakeClient({ failPages: new Set(["home"]) }) as never, {
    delayMs: 0,
    pages: ["home"],
  });

  expect(compact[0]).toMatchObject({
    page: "home",
    ok: true,
    fallback: true,
  });
  expect(compact[0]).not.toHaveProperty("fallbackSections");

  const detailed = await sweepRouter(fakeClient({ failPages: new Set(["home"]) }) as never, {
    delayMs: 0,
    pages: ["home"],
    includeParsed: true,
  });

  expect(detailed[0]?.fallbackSections?.map((section) => section.page)).toEqual([
    "sysinfo",
    "broadbandstatistics",
    "firewall",
  ]);
  expect(detailed[0]?.fallbackSections?.every((section) => Object.keys(section.values).length > 0)).toBe(true);
});

test("scan compatibility path is the sweep core metadata path", async () => {
  const client = fakeClient();

  const [scan, sweep] = await Promise.all([
    scanRouter(client as never, { delayMs: 0, pages: ["diag"] }),
    sweepRouter(fakeClient() as never, { delayMs: 0, pages: ["diag"] }),
  ]);

  expect(scan).toEqual(sweep);
});

test("CLI and fixture capture are wired to the shared sweep core", () => {
  const cli = readFileSync("src/cli.ts", "utf8");
  const capture = readFileSync("scripts/capture-router-fixtures.ts", "utf8");

  expect(cli).toContain("sweepRouter");
  expect(cli).not.toContain("scanRouter");
  expect(capture).toContain("sweepRouter");
});

function fakeClient(options: { failPages?: Set<string> } = {}): { calls: string[]; getCgiPage: (page: string) => Promise<unknown> } {
  const calls: string[] = [];
  return {
    calls,
    async getCgiPage(page: string) {
      calls.push(page);
      if (options.failPages?.has(page)) throw new Error(`boom ${page}`);
      return {
        statusCode: 200,
        statusMessage: "OK",
        headers: {},
        body: `<title>${page}</title><h1>${page}</h1>
          <table><tr><td>Status</td><td>Up</td></tr></table>
          <form action="/cgi-bin/${page}.ha">
            <input name="nonce" value="abc">
            <input name="target" value="example.com">
            <input type="submit" name="Ping" value="Ping">
          </form>`,
        url: `https://router/cgi-bin/${page}.ha`,
      };
    },
  };
}
