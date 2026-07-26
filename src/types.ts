export type RouterClientOptions = {
  host: string;
  accessCode?: string | undefined;
  timeoutMs: number;
  insecureTls: boolean;
  userAgent: string;
  waitForSession?: boolean | undefined;
  sessionWaitTimeoutMs?: number | undefined;
  sessionWaitIntervalMs?: number | undefined;
  onSessionWait?: ((event: { waitedMs: number; retryCount: number; timeoutMs: number; intervalMs: number }) => void) | undefined;
};

export type RouterSessionSnapshot = {
  origin: string;
  authenticated: boolean;
  cookies: Record<string, string>;
};

export type HttpMethod = "GET" | "POST";

export type HttpResponse = {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  url: string;
};

export type SitemapEntry = {
  page: string;
  label: string;
  href: string;
};

export type ParsedField = {
  name: string;
  type: string;
  value: string;
  checked: boolean;
  sensitive: boolean;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
};

export type ParsedSelect = {
  name: string;
  value: string;
  options: string[];
  sensitive: boolean;
  optionDetails?: Array<{
    value: string;
    label: string;
    selected: boolean;
    disabled: boolean;
  }> | undefined;
  disabled?: boolean | undefined;
};

export type ParsedTextarea = {
  name: string;
  value: string;
  sensitive: boolean;
  disabled?: boolean | undefined;
  readOnly?: boolean | undefined;
};

export type ParsedButton = {
  name: string;
  type: string;
  value: string;
  label: string;
  sensitive: boolean;
  disabled?: boolean | undefined;
};

export type ParsedForm = {
  method: string;
  action: string;
  fieldNames: string[];
  selectNames: string[];
  textareaNames: string[];
  buttonNames: string[];
};

export type ParsedValueEntry = {
  section: string;
  label: string;
  value: string;
  defaultValue?: string | undefined;
};

export type ParsedLink = {
  label: string;
  href: string;
  page?: string | undefined;
  kind: "router-page" | "external" | "other";
};

export type ParsedPage = {
  page: string;
  title: string;
  heading: string;
  values: Record<string, string>;
  valueEntries?: ParsedValueEntry[] | undefined;
  tables: Record<string, string>[];
  fields: ParsedField[];
  selects: ParsedSelect[];
  textareas: ParsedTextarea[];
  buttons: ParsedButton[];
  forms: ParsedForm[];
  links?: ParsedLink[] | undefined;
};

export type Device = {
  status: string;
  name: string;
  ip: string;
  mac: string;
  connection: string;
  connectionSpeed?: string | undefined;
  allocation?: string | undefined;
  lastActivity?: string | undefined;
  meshClient?: string | undefined;
  ipv6?: string | undefined;
  deviceType?: string | undefined;
  validLifetime?: string | undefined;
  preferredLifetime?: string | undefined;
};

export type LogEntry = {
  id: string;
  time: string;
  source: string;
  destination: string;
  protocol: string;
  reason: string;
};
