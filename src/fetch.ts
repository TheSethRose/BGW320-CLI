import { BGW320Client, RouterAuthError } from "./client.js";
import { looksLikeLogin, parsePage } from "./parser.js";
import type { ParsedPage } from "./types.js";

export type ParsedPageResult = {
  page: string;
  ok: boolean;
  statusCode?: number;
  parsed?: ParsedPage;
  error?: string;
};

export async function fetchParsedPage(client: BGW320Client, page: string, options: { includeSecrets?: boolean } = {}): Promise<ParsedPageResult> {
  try {
    const response = await client.getCgiPage(page);
    const parsed = parsePage(page, response.body, { includeSecrets: options.includeSecrets === true });
    if (looksLikeLogin(response.body)) {
      return {
        page,
        ok: false,
        statusCode: response.statusCode,
        error: "Router returned the login page instead of the requested page.",
        parsed,
      };
    }
    if (isPageNotFound(parsed)) {
      return {
        page,
        ok: false,
        statusCode: response.statusCode,
        error: parsed.heading || parsed.title || "Page not found",
        parsed,
      };
    }
    return {
      page,
      ok: response.statusCode >= 200 && response.statusCode < 400,
      statusCode: response.statusCode,
      parsed,
    };
  } catch (error) {
    if (error instanceof RouterAuthError) throw error;
    return {
      page,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isPageNotFound(parsed: ParsedPage): boolean {
  return /^Page not found\.?$/i.test(parsed.title) || /^Page not found\.?$/i.test(parsed.heading);
}

export function parsedDataCount(parsed: ParsedPage): number {
  return Object.keys(parsed.values).length
    + parsed.tables.length
    + parsed.fields.length
    + parsed.selects.length
    + parsed.textareas.length
    + parsed.buttons.length
    + parsed.forms.length;
}
