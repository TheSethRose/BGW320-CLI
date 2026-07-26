const sensitiveNamePattern = /(password|passwd|passphrase|key|secret|access.?code|wpa|psk|ssidpwd|hashpassword|nonce|wps.?pin|phone.?number|caller)/i;

export function isSensitiveName(name: string): boolean {
  return sensitiveNamePattern.test(name);
}

export function redactValue(name: string, value: string, includeSecrets: boolean): string {
  if (includeSecrets || !value) return value;
  if (isSensitiveName(name)) return "[redacted]";
  return value;
}
