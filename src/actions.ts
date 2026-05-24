import { redactValue } from "./redact.js";

export type RouterAction = {
  name: string;
  page: string;
  description: string;
  confirmToken: string;
  payload: Record<string, string>;
  dangerous: boolean;
  aliases?: string[];
};

export const routerActions: RouterAction[] = [
  {
    name: "restart",
    page: "restart",
    description: "Restart the gateway.",
    confirmToken: "RESTART",
    payload: { Restart: "Restart Device" },
    dangerous: true,
    aliases: ["restart-device", "reboot"],
  },
  {
    name: "clear-device-list",
    page: "devices",
    description: "Clear inactive devices from the device list.",
    confirmToken: "CLEAR-DEVICES",
    payload: { Clear: "Clear Device List" },
    dangerous: false,
  },
  {
    name: "run-speed-test",
    page: "speed",
    description: "Run the router speed test.",
    confirmToken: "SPEED",
    payload: { run: "Run Speed Test" },
    dangerous: false,
    aliases: ["speed-test"],
  },
  {
    name: "run-full-diagnostics",
    page: "diag",
    description: "Run the router's full diagnostic test suite.",
    confirmToken: "DIAG",
    payload: { RunFullDiagnostics: "Run Full Diagnostics" },
    dangerous: false,
    aliases: ["full-diagnostics"],
  },
  {
    name: "send-diagnostics",
    page: "diag",
    description: "Send the router diagnostics report to AT&T.",
    confirmToken: "SEND-DIAGNOSTICS",
    payload: { SendDiagnostics: "Send Diagnostics" },
    dangerous: false,
    aliases: ["send-diagnostic-report"],
  },
  {
    name: "diagnostics-ethernet-details",
    page: "diag",
    description: "Show Ethernet diagnostic details.",
    confirmToken: "DIAG",
    payload: { EthDetails: "Details" },
    dangerous: false,
    aliases: ["ethernet-details"],
  },
  {
    name: "diagnostics-authentication-details",
    page: "diag",
    description: "Show authentication diagnostic details.",
    confirmToken: "DIAG",
    payload: { AuthDetails: "Details" },
    dangerous: false,
    aliases: ["authentication-details"],
  },
  {
    name: "diagnostics-ip-details",
    page: "diag",
    description: "Show IP diagnostic details.",
    confirmToken: "DIAG",
    payload: { IPDetails: "Details" },
    dangerous: false,
    aliases: ["ip-details"],
  },
  {
    name: "diagnostics-dns-details",
    page: "diag",
    description: "Show DNS diagnostic details.",
    confirmToken: "DIAG",
    payload: { DNSDetails: "Details" },
    dangerous: false,
    aliases: ["dns-details"],
  },
  {
    name: "packet-filter-enable",
    page: "packetfilter",
    description: "Enable packet filters.",
    confirmToken: "PACKETFILTER",
    payload: { Enable: "Enable Packet Filters" },
    dangerous: false,
    aliases: ["enable-packet-filter", "enable-packet-filters"],
  },
  {
    name: "packet-filter-add-drop-rule",
    page: "packetfilter",
    description: "Open/add a packet-filter drop rule.",
    confirmToken: "PACKETFILTER",
    payload: { AddDropRule: "Add a 'Drop' Rule" },
    dangerous: false,
    aliases: ["add-drop-rule"],
  },
  {
    name: "packet-filter-add-pass-rule",
    page: "packetfilter",
    description: "Open/add a packet-filter pass rule.",
    confirmToken: "PACKETFILTER",
    payload: { AddPassRule: "Add a 'Pass' Rule" },
    dangerous: false,
    aliases: ["add-pass-rule"],
  },
  {
    name: "reset-ip",
    page: "reset",
    description: "Reset the router IP stack.",
    confirmToken: "RESET-IP",
    payload: { ResetIP: "Reset IP" },
    dangerous: true,
  },
  {
    name: "reset-connection",
    page: "reset",
    description: "Reset the router broadband connection.",
    confirmToken: "RESET-CONNECTION",
    payload: { ResetConn: "Reset Connection" },
    dangerous: true,
  },
  {
    name: "restart-from-resets",
    page: "reset",
    description: "Restart from the Diagnostics > Resets page.",
    confirmToken: "RESTART",
    payload: { Restart: "Restart" },
    dangerous: true,
  },
  {
    name: "reset-wifi-config",
    page: "reset",
    description: "Reset Wi-Fi configuration.",
    confirmToken: "RESET-WIFI-CONFIG",
    payload: { WReset: "Reset Wi-Fi Config" },
    dangerous: true,
    aliases: ["reset-wi-fi-config"],
  },
  {
    name: "reset-firewall-config",
    page: "reset",
    description: "Reset firewall configuration.",
    confirmToken: "RESET-FIREWALL-CONFIG",
    payload: { FReset: "Reset Firewall Config" },
    dangerous: true,
  },
  {
    name: "factory-reset",
    page: "reset",
    description: "Reset the device to defaults.",
    confirmToken: "FACTORY-RESET",
    payload: { Reset: "Reset Device..." },
    dangerous: true,
    aliases: ["reset-device"],
  },
];

export function getAction(name: string): RouterAction | undefined {
  const normalized = normalizeAction(name);
  return routerActions.find((action) => {
    return [action.name, ...(action.aliases ?? [])].some((candidate) => normalizeAction(candidate) === normalized);
  });
}

export function displayActionPayload(action: RouterAction, includeSecrets = false): Record<string, string> {
  return Object.fromEntries(
    Object.entries(action.payload).map(([name, value]) => [name, redactValue(name, value, includeSecrets)]),
  );
}

function normalizeAction(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
