import { expect, test } from "bun:test";
import { devicesFromIpAllocationRows } from "../src/devices.js";

test("devicesFromIpAllocationRows builds degraded device records", () => {
  expect(devicesFromIpAllocationRows([{
    "IPv4 Address / Name": "192.168.1.20 / laptop",
    "MAC Address": "aa:bb:cc:dd:ee:ff",
    Status: "on",
    Allocation: "dhcp",
  }])).toEqual([{
    status: "on",
    name: "laptop",
    ip: "192.168.1.20",
    mac: "aa:bb:cc:dd:ee:ff",
    connection: "",
    allocation: "dhcp",
    lastActivity: "",
  }]);
});
