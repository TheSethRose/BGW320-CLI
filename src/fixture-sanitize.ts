export function sanitizeRouterFixture(value: string): string {
  return value
    .replace(/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, "[redacted-mac]")
    .replace(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, "[redacted-ip]")
    .replace(/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, "[redacted-ipv6]")
    .replace(/\b(?=[0-9a-f:]*::)(?:[0-9a-f]{0,4}:){1,7}[0-9a-f]{0,4}\b/gi, "[redacted-ipv6]")
    .replace(/(name=["'](?:nonce|hashpassword|password|.*?pass.*?|.*?key.*?|.*?ssid.*?|wps.?pin.*?|serial(?:number)?|hostname|device.?name)["'][^>]*value=["'])[^"']*(["'])/gi, "$1[redacted]$2")
    .replace(/(value=["'])[^"']*(["'][^>]*name=["'](?:nonce|hashpassword|password|.*?pass.*?|.*?key.*?|.*?ssid.*?|wps.?pin.*?|serial(?:number)?|hostname|device.?name)["'])/gi, "$1[redacted]$2")
    .replace(/((?:Network Name \(SSID\)|Guest Network Name|Password)\s+Default:\s*)[^<\r\n]+/gi, "$1[redacted]")
    .replace(/(<t[dh]\b[^>]*>\s*(?:Serial Number|Vendor SN|Phone Number|Far-End Caller Information)\s*<\/t[dh]>\s*<t[dh]\b[^>]*>)[\s\S]*?(<\/t[dh]>)/gi, "$1[redacted]$2")
    .replace(/(\[redacted-ip\]\s*\/\s*)[^<\r\n]+/gi, "$1[redacted-name]")
    .replace(/[^<>\r\n/]+(\/\[redacted-mac\])/g, "[redacted-name]$1");
}

export function containsSensitiveFixtureValue(value: string): boolean {
  return /"value":"(?!\[redacted\])[^"]+"[^{}]{0,160}"sensitive":true/i.test(value)
    || /(?:Network Name \(SSID\)|Guest Network Name|Password)\s+Default:(?!\s*\[redacted\])\s*\S/i.test(value)
    || /\b[a-f0-9]{32}\b/i.test(value)
    || /\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/i.test(value);
}
