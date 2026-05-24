import { expect, test } from "bun:test";
import { listSections, resolvePage, resolveSectionCommand, routerTabs, tabsForSection } from "../src/pages.js";

test("routerTabs covers requested router sections", () => {
  expect(listSections()).toEqual(["Device", "Broadband", "Home Network", "Voice", "Firewall", "Diagnostics"]);
  expect(routerTabs).toHaveLength(36);
});

test("routerTabs includes every tab from the stated objective", () => {
  const requiredTabs = [
    "Device/Status",
    "Device/Device List",
    "Device/System Information",
    "Device/Access Code",
    "Device/Remote Access",
    "Device/Restart Device",
    "Broadband/Status",
    "Broadband/Configure",
    "Broadband/Fiber Status",
    "Home Network/Status",
    "Home Network/Configure",
    "Home Network/IPv6",
    "Home Network/Wi-Fi",
    "Home Network/MAC Filtering",
    "Home Network/Subnets & DHCP",
    "Home Network/IP Allocation",
    "Voice/Status",
    "Voice/Line Details",
    "Voice/Call Statistics",
    "Firewall/Status",
    "Firewall/Packet Filter",
    "Firewall/NAT/Gaming",
    "Firewall/Public Subnet Hosts",
    "Firewall/IP Passthrough",
    "Firewall/Firewall Advanced",
    "Firewall/Security Options",
    "Diagnostics/Troubleshoot",
    "Diagnostics/Speed Test",
    "Diagnostics/Logs",
    "Diagnostics/Update",
    "Diagnostics/Resets",
    "Diagnostics/Syslog",
    "Diagnostics/Event Notifications",
    "Diagnostics/NAT Table",
  ];

  expect(routerTabs.map((tab) => `${tab.section}/${tab.label}`)).toEqual(expect.arrayContaining(requiredTabs));
});

test("resolvePage accepts raw CGI IDs and human tab paths", () => {
  expect(resolvePage("wconfig_unified")).toBe("wconfig_unified");
  expect(resolvePage("Home Network/Wi-Fi")).toBe("wconfig_unified");
  expect(resolvePage("Subnets & DHCP")).toBe("dhcpserver");
  expect(resolvePage("NAT/Gaming")).toBe("apphosting");
  expect(resolvePage("Device/Restart Device")).toBe("restart");
});

test("tabsForSection returns section entries", () => {
  expect(tabsForSection("diagnostics").map((tab) => tab.page)).toEqual([
    "diag",
    "speed",
    "logs",
    "update",
    "reset",
    "syslog",
    "events",
    "nattable",
    "sitemap",
  ]);
});

test("resolveSectionCommand resolves human command tree", () => {
  expect(resolveSectionCommand("device", [])?.page).toBe("home");
  expect(resolveSectionCommand("broadband", ["fiber-status"])?.page).toBe("fiberstat");
  expect(resolveSectionCommand("home-network", ["wi-fi"])?.page).toBe("wconfig_unified");
  expect(resolveSectionCommand("firewall", ["nat-gaming"])?.page).toBe("apphosting");
  expect(resolveSectionCommand("diagnostics", ["nat-table"])?.page).toBe("nattable");
});
