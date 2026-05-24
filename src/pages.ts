export type RouterSectionName =
  | "Device"
  | "Broadband"
  | "Home Network"
  | "Voice"
  | "Firewall"
  | "Diagnostics";

export type RouterTab = {
  section: RouterSectionName;
  label: string;
  page: string;
  aliases: string[];
  dangerous?: boolean;
};

export const routerTabs: RouterTab[] = [
  { section: "Device", label: "Status", page: "home", aliases: ["device", "device status", "status"] },
  { section: "Device", label: "Device List", page: "devices", aliases: ["device list", "devices"] },
  { section: "Device", label: "System Information", page: "sysinfo", aliases: ["system information", "sysinfo", "system info"] },
  { section: "Device", label: "Access Code", page: "routerpasswd", aliases: ["access code", "router password", "routerpasswd"], dangerous: true },
  { section: "Device", label: "Remote Access", page: "remoteaccess", aliases: ["remote access", "remoteaccess"] },
  { section: "Device", label: "Restart Device", page: "restart", aliases: ["restart device", "restart"], dangerous: true },

  { section: "Broadband", label: "Status", page: "broadbandstatistics", aliases: ["broadband", "broadband status", "broadbandstatistics"] },
  { section: "Broadband", label: "Configure", page: "broadbandconfig", aliases: ["broadband configure", "broadband config", "broadbandconfig"] },
  { section: "Broadband", label: "Fiber Status", page: "fiberstat", aliases: ["fiber", "fiber status", "fiberstat"] },

  { section: "Home Network", label: "Status", page: "lanstatistics", aliases: ["home network", "home network status", "lanstatistics", "lan status"] },
  { section: "Home Network", label: "Configure", page: "etherlan", aliases: ["home network configure", "etherlan", "ethernet lan"] },
  { section: "Home Network", label: "IPv6", page: "ip6lan", aliases: ["ipv6", "ip6lan"] },
  { section: "Home Network", label: "Wi-Fi", page: "wconfig_unified", aliases: ["wifi", "wi-fi", "wireless", "wconfig_unified"] },
  { section: "Home Network", label: "MAC Filtering", page: "wmacauth", aliases: ["mac filtering", "wifi mac filtering", "wmacauth"] },
  { section: "Home Network", label: "Subnets & DHCP", page: "dhcpserver", aliases: ["subnets", "dhcp", "subnets dhcp", "subnets and dhcp", "dhcpserver"] },
  { section: "Home Network", label: "IP Allocation", page: "ipalloc", aliases: ["ip allocation", "ipalloc"] },

  { section: "Voice", label: "Status", page: "voice", aliases: ["voice", "voice status"] },
  { section: "Voice", label: "Line Details", page: "voiceconfig", aliases: ["line details", "voice line details", "voiceconfig"] },
  { section: "Voice", label: "Call Statistics", page: "voicestat", aliases: ["call statistics", "voice call statistics", "voicestat"] },

  { section: "Firewall", label: "Status", page: "firewall", aliases: ["firewall", "firewall status"] },
  { section: "Firewall", label: "Custom Services", page: "services", aliases: ["custom services", "services"] },
  { section: "Firewall", label: "Packet Filter", page: "packetfilter", aliases: ["packet filter", "packetfilter"] },
  { section: "Firewall", label: "NAT/Gaming", page: "apphosting", aliases: ["nat gaming", "nat/gaming", "gaming", "apphosting"] },
  { section: "Firewall", label: "Public Subnet Hosts", page: "pshosts", aliases: ["public subnet hosts", "pshosts"] },
  { section: "Firewall", label: "IP Passthrough", page: "ippass", aliases: ["ip passthrough", "ippass"] },
  { section: "Firewall", label: "Firewall Advanced", page: "dosprotect", aliases: ["firewall advanced", "advanced firewall", "dosprotect"] },
  { section: "Firewall", label: "Security Options", page: "securityoptions", aliases: ["security options", "securityoptions"] },

  { section: "Diagnostics", label: "Troubleshoot", page: "diag", aliases: ["troubleshoot", "diagnostics", "diag"] },
  { section: "Diagnostics", label: "Speed Test", page: "speed", aliases: ["speed test", "speed"] },
  { section: "Diagnostics", label: "Logs", page: "logs", aliases: ["logs"] },
  { section: "Diagnostics", label: "Update", page: "update", aliases: ["update", "firmware update"], dangerous: true },
  { section: "Diagnostics", label: "Resets", page: "reset", aliases: ["resets", "reset"], dangerous: true },
  { section: "Diagnostics", label: "Syslog", page: "syslog", aliases: ["syslog"] },
  { section: "Diagnostics", label: "Event Notifications", page: "events", aliases: ["event notifications", "events"] },
  { section: "Diagnostics", label: "NAT Table", page: "nattable", aliases: ["nat table", "nattable"] },
  { section: "Diagnostics", label: "Site Map", page: "sitemap", aliases: ["site map", "sitemap"] },
];

export function listSections(): RouterSectionName[] {
  return [...new Set(routerTabs.map((tab) => tab.section))];
}

export function tabsForSection(section: string): RouterTab[] {
  const key = normalize(section);
  return routerTabs.filter((tab) => normalize(tab.section) === key);
}

export function resolveTab(input: string): RouterTab | undefined {
  const normalized = normalize(input);
  return routerTabs.find((tab) => {
    const candidates = [
      tab.page,
      tab.label,
      `${tab.section}/${tab.label}`,
      `${tab.section} ${tab.label}`,
      ...tab.aliases,
    ];
    return candidates.some((candidate) => normalize(candidate) === normalized);
  });
}

export function resolvePage(input: string): string {
  return resolveTab(input)?.page ?? input;
}

export function resolveSectionCommand(root: string, args: string[]): RouterTab | undefined {
  const section = sectionForRoot(root);
  if (!section) return undefined;
  const tabInput = args.length > 0 ? args.join(" ") : defaultTabForSection(section);
  const normalizedTab = normalize(tabInput);

  return routerTabs.find((tab) => {
    if (tab.section !== section) return false;
    const candidates = [
      tab.page,
      tab.label,
      `${tab.section}/${tab.label}`,
      `${tab.section} ${tab.label}`,
      ...tab.aliases,
    ];
    return candidates.some((candidate) => normalize(candidate) === normalizedTab);
  });
}

export function normalize(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function sectionForRoot(root: string): RouterSectionName | undefined {
  const normalized = normalize(root);
  if (normalized === "device") return "Device";
  if (normalized === "broadband") return "Broadband";
  if (normalized === "homenetwork" || normalized === "home" || normalized === "lan") return "Home Network";
  if (normalized === "voice") return "Voice";
  if (normalized === "firewall") return "Firewall";
  if (normalized === "diagnostics" || normalized === "diagnostic" || normalized === "diag") return "Diagnostics";
  return undefined;
}

function defaultTabForSection(section: RouterSectionName): string {
  if (section === "Diagnostics") return "Troubleshoot";
  return "Status";
}
