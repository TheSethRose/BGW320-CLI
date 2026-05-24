import { stdin } from "node:process";

export type GlobalOptions = {
  host: string;
  accessCode?: string | undefined;
  accessCodeStdin: boolean;
  json: boolean;
  includeSecrets: boolean;
  timeoutMs: number;
  insecureTls: boolean;
};

export async function resolveAccessCode(options: GlobalOptions): Promise<string | undefined> {
  if (options.accessCode) return options.accessCode;
  if (process.env.BGW_ACCESS_CODE) return process.env.BGW_ACCESS_CODE;
  if (!options.accessCodeStdin) return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8").trimEnd();
}

export function envDefaultOptions(): GlobalOptions {
  return {
    host: process.env.BGW_HOST || process.env.ROUTER_IP || "192.168.1.254",
    accessCodeStdin: false,
    json: false,
    includeSecrets: false,
    timeoutMs: Number(process.env.BGW_TIMEOUT_MS || 15000),
    insecureTls: process.env.BGW_INSECURE_TLS !== "0",
  };
}
