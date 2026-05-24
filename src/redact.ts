const sensitiveNamePattern = /(password|passwd|passphrase|key|secret|access.?code|wpa|psk|ssidpwd|hashpassword|nonce)/i;
const macPattern = /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/gi;

export function isSensitiveName(name: string): boolean {
  return sensitiveNamePattern.test(name);
}

export function redactValue(name: string, value: string, includeSecrets: boolean): string {
  if (includeSecrets || !value) return value;
  if (isSensitiveName(name)) return "[redacted]";
  return value;
}

export function redactMac(value: string): string {
  return value.replace(macPattern, (mac) => {
    const parts = mac.split(":");
    return `${parts[0]}:${parts[1]}:xx:xx:${parts[4]}:${parts[5]}`;
  });
}
