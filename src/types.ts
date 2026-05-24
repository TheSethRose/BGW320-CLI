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
};

export type ParsedSelect = {
  name: string;
  value: string;
  options: string[];
  sensitive: boolean;
};

export type ParsedTextarea = {
  name: string;
  value: string;
  sensitive: boolean;
};

export type ParsedButton = {
  name: string;
  type: string;
  value: string;
  label: string;
  sensitive: boolean;
};

export type ParsedForm = {
  method: string;
  action: string;
  fieldNames: string[];
  selectNames: string[];
  textareaNames: string[];
  buttonNames: string[];
};

export type ParsedPage = {
  page: string;
  title: string;
  heading: string;
  values: Record<string, string>;
  tables: Record<string, string>[];
  fields: ParsedField[];
  selects: ParsedSelect[];
  textareas: ParsedTextarea[];
  buttons: ParsedButton[];
  forms: ParsedForm[];
};

export type Device = {
  status: string;
  name: string;
  ip: string;
  mac: string;
  connection: string;
  allocation?: string | undefined;
  lastActivity?: string | undefined;
  meshClient?: string | undefined;
};

export type LogEntry = {
  id: string;
  time: string;
  source: string;
  destination: string;
  protocol: string;
  reason: string;
};
