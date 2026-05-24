import type { PageScan } from "./scan.js";

type AuditPage = PageScan & {
  useful: boolean;
};

export type AuditResult = {
  totalPages: number;
  okPages: number;
  failedPages: number;
  fallbackPages: number;
  usefulPages: number;
  emptyPages: number;
  dangerousPages: number;
  pages: AuditPage[];
};

export function buildAudit(scans: PageScan[]): AuditResult {
  const pages = scans.map((scan) => ({
    ...scan,
    useful: scan.ok && (scan.dataCount ?? 0) > 0,
  }));

  return {
    totalPages: pages.length,
    okPages: pages.filter((page) => page.ok).length,
    failedPages: pages.filter((page) => !page.ok).length,
    fallbackPages: pages.filter((page) => page.fallback).length,
    usefulPages: pages.filter((page) => page.useful).length,
    emptyPages: pages.filter((page) => page.ok && !page.useful).length,
    dangerousPages: pages.filter((page) => page.dangerous).length,
    pages,
  };
}
