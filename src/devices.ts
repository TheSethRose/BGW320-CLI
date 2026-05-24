import { BGW320Client, RouterAuthError } from "./client.js";
import { fetchParsedPage } from "./fetch.js";
import { parseDevices } from "./parser.js";
import type { Device } from "./types.js";

export type DeviceListResult = {
  fallback: boolean;
  devices: Device[];
  error?: string;
};

export async function fetchDeviceList(client: BGW320Client, options: { includeOffline?: boolean } = {}): Promise<DeviceListResult> {
  try {
    const response = await client.getCgiPage("devices");
    return {
      fallback: false,
      devices: filterDevices(parseDevices(response.body), options.includeOffline === true),
    };
  } catch (error) {
    const fallback = await fetchParsedPageSoft(client, "ipalloc");
    if (!fallback.ok || !fallback.parsed) {
      return {
        fallback: true,
        devices: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      fallback: true,
      error: error instanceof Error ? error.message : String(error),
      devices: filterDevices(devicesFromIpAllocationRows(fallback.parsed.tables), options.includeOffline === true),
    };
  }
}

async function fetchParsedPageSoft(client: BGW320Client, page: string) {
  try {
    return await fetchParsedPage(client, page);
  } catch (error) {
    if (error instanceof RouterAuthError) {
      return {
        page,
        ok: false,
        error: error.message,
      };
    }
    throw error;
  }
}

export function devicesFromIpAllocationRows(rows: Record<string, string>[]): Device[] {
  return rows.map((row) => {
    const { ip, name } = splitIpAndName(row["IPv4 Address / Name"] ?? "");
    return {
      status: row.Status ?? "",
      name,
      ip,
      mac: row["MAC Address"] ?? "",
      connection: "",
      allocation: row.Allocation,
      lastActivity: "",
    };
  }).filter((device) => device.ip || device.mac || device.name);
}

function filterDevices(devices: Device[], includeOffline: boolean): Device[] {
  return includeOffline ? devices : devices.filter((device) => /on/i.test(device.status));
}

function splitIpAndName(value: string): { ip: string; name: string } {
  const [ip = "", name = ""] = value.split(/\s+\/\s+/, 2);
  return { ip: ip.trim(), name: name.trim() };
}
