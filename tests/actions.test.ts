import { expect, test } from "bun:test";
import { displayActionPayload, getAction, routerActions } from "../src/actions.js";

test("routerActions includes observed button-style operations", () => {
  expect(routerActions.map((action) => action.name)).toEqual([
    "restart",
    "clear-device-list",
    "run-speed-test",
    "run-full-diagnostics",
    "send-diagnostics",
    "diagnostics-ethernet-details",
    "diagnostics-authentication-details",
    "diagnostics-ip-details",
    "diagnostics-dns-details",
    "packet-filter-enable",
    "packet-filter-add-drop-rule",
    "packet-filter-add-pass-rule",
    "reset-ip",
    "reset-connection",
    "restart-from-resets",
    "reset-wifi-config",
    "reset-firewall-config",
    "factory-reset",
  ]);
});

test("getAction resolves aliases", () => {
  expect(getAction("reboot")?.name).toBe("restart");
  expect(getAction("speed-test")?.name).toBe("run-speed-test");
  expect(getAction("full-diagnostics")?.name).toBe("run-full-diagnostics");
  expect(getAction("send-diagnostic-report")?.name).toBe("send-diagnostics");
  expect(getAction("reset-device")?.name).toBe("factory-reset");
});

test("displayActionPayload redacts sensitive names", () => {
  expect(displayActionPayload({
    name: "example",
    page: "routerpasswd",
    description: "example",
    confirmToken: "EXAMPLE",
    payload: { password: "secret" },
    dangerous: true,
  })).toEqual({ password: "[redacted]" });
});
