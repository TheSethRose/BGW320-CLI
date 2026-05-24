import type { BGW320Client } from "./client.js";
import { sweepRouter, type SweepPage } from "./sweep.js";

export type PageScan = SweepPage;

export async function scanRouter(client: BGW320Client, options: { delayMs: number; includeParsed?: boolean; includeForms?: boolean; pages?: string[] }): Promise<PageScan[]> {
  return sweepRouter(client, {
    delayMs: options.delayMs,
    pages: options.pages,
    includeParsed: options.includeParsed === true,
    includeForms: options.includeForms === true,
    useFallbacks: true,
  });
}
