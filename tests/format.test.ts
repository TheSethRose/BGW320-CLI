import { expect, test } from "bun:test";
import { printParsedPage } from "../src/format.js";
import { parsePage } from "../src/parser.js";

test("Wi-Fi summary uses form state instead of noisy option text", () => {
  const page = parsePage("wconfig_unified", `
    <title>Wi-Fi</title>
    <table><tr><td>Home SSID Enable Default: On</td><td>Off On</td></tr></table>
    <form method="post" action="/cgi-bin/wconfig_unified.ha">
      <input name="nonce" value="abc">
      <input name="home_ssidname" value="HomeNet">
      <input name="homeSSID_key" value="secret">
      <input name="guest_ssidname" value="GuestNet">
      <input name="u_octet" value="2">
      <select name="u_ussidenable"><option value="off">Off</option><option value="on" selected>On</option></select>
      <select name="homeSSID_security"><option value="wpa">WPA</option><option value="defwpa" selected>Default</option></select>
      <select name="u_gssidenable"><option value="off" selected>Off</option><option value="on">On</option></select>
      <select name="u_gssidisolate"><option value="on" selected>Internet Only</option><option value="off">LAN</option></select>
      <input type="submit" name="Save" value="Save">
    </form>
  `);

  const output = captureStdout(() => printParsedPage(page));

  expect(output).toContain("Home SSID");
  expect(output).toContain("HomeNet");
  expect(output).toContain("Home password");
  expect(output).toContain("[redacted]");
  expect(output).toContain("Guest access");
  expect(output).toContain("Internet Only");
  expect(output).not.toContain("Off On");
});

test("NAT/Gaming summary does not dump every device option", () => {
  const page = parsePage("apphosting", `
    <title>NAT/Gaming</title>
    <table><tr><td>Needed by Device</td><td>device-a device-b device-c</td></tr></table>
    <form method="post" action="/cgi-bin/apphosting.ha">
      <input name="nonce" value="abc">
      <select name="service"><option value="HTTP" selected>HTTP</option><option value="SSH">SSH</option></select>
      <select name="device"><option value="aa:bb" selected>laptop</option><option value="cc:dd">server</option></select>
      <input type="submit" name="Add" value="Add">
    </form>
  `);

  const output = captureStdout(() => printParsedPage(page));

  expect(output).toContain("Selected service");
  expect(output).toContain("HTTP");
  expect(output).toContain("Known devices");
  expect(output).not.toContain("device-a device-b device-c");
});

test("Access Code summary shows redacted form state by default", () => {
  const page = parsePage("routerpasswd", `
    <title>Access Code</title>
    <form method="post" action="/cgi-bin/routerpasswd.ha">
      <input name="nonce" value="abc">
      <input name="old_password" value="old-secret">
      <input name="new_password" value="new-secret">
      <input name="confirm_password" value="new-secret">
      <input type="submit" name="Save" value="Save">
    </form>
  `);

  const output = captureStdout(() => printParsedPage(page));

  expect(output).toContain("Old Password");
  expect(output).toContain("[redacted]");
  expect(output).not.toContain("old-secret");
  expect(output).not.toContain("new-secret");
  expect(output).toContain("Available actions");
});

test("Restart-style pages surface actions without form noise", () => {
  const page = parsePage("restart", `
    <title>Restart Device</title>
    <form method="post" action="/cgi-bin/restart.ha">
      <input name="nonce" value="abc">
      <input type="submit" name="Restart" value="Restart Device">
    </form>
  `);

  const output = captureStdout(() => printParsedPage(page));

  expect(output).toContain("Available actions");
  expect(output).toContain("Restart Device");
  expect(output).toContain("Controls");
  expect(output).toContain("Fields        0");
});

function captureStdout(fn: () => void): string {
  const stdout = process.stdout as NodeJS.WriteStream & { write: (chunk: unknown) => boolean };
  const originalWrite = stdout.write;
  let output = "";
  stdout.write = ((chunk: unknown) => {
    output += String(chunk);
    return true;
  }) as typeof stdout.write;
  try {
    fn();
  } finally {
    stdout.write = originalWrite;
  }
  return output;
}
