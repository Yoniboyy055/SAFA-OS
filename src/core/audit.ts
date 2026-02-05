const fs = require("fs");
const path = require("path");

export interface AuditEvent {
  timestamp: string;
  actor: string;
  action: string;
  approved: boolean;
  target: string;
  result: string;
}

export interface NetworkRequestAudit {
  url: string;
  domain: string;
  method: string;
  purpose: string;
  approved: boolean;
  bodyHash: string;
  bodySummary: string;
  headers?: Record<string, string>;
}

export interface NetworkResultAudit {
  status: number;
  bytes: number;
  durationMs: number;
  responseHash: string;
}

export interface RedactionOptions {
  redactKeys?: string[];
  maxFieldLength?: number;
}

const DEFAULT_REDACT_KEYS = [
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "authorization",
  "bearer",
  "key",
  "cookie",
  "set-cookie"
];

function normalizeRedaction(options: RedactionOptions): {
  redactKeys: Set<string>;
  sensitiveMarkers: string[];
  maxFieldLength: number;
} {
  const keys =
    options.redactKeys && options.redactKeys.length > 0
      ? options.redactKeys
      : DEFAULT_REDACT_KEYS;
  const redactKeys = new Set(keys.map((key) => key.toLowerCase()));
  return {
    redactKeys,
    sensitiveMarkers: Array.from(redactKeys),
    maxFieldLength: options.maxFieldLength ?? 1000
  };
}

function redactString(
  value: string,
  sensitiveMarkers: string[],
  maxFieldLength: number
): string {
  const trimmed =
    value.length > maxFieldLength
      ? `${value.slice(0, maxFieldLength)}...[TRUNCATED]`
      : value;
  const lowered = trimmed.toLowerCase();
  if (sensitiveMarkers.some((marker) => lowered.includes(marker))) {
    return "[REDACTED]";
  }
  return trimmed;
}

function redactValue(
  value: unknown,
  redactKeys: Set<string>,
  sensitiveMarkers: string[],
  maxFieldLength: number
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      redactValue(entry, redactKeys, sensitiveMarkers, maxFieldLength)
    );
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (redactKeys.has(key.toLowerCase())) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactValue(
          entry,
          redactKeys,
          sensitiveMarkers,
          maxFieldLength
        );
      }
    }
    return output;
  }
  if (typeof value === "string") {
    return redactString(value, sensitiveMarkers, maxFieldLength);
  }
  return value;
}

export function redactSensitive(
  value: unknown,
  options: RedactionOptions = {}
): unknown {
  const { redactKeys, sensitiveMarkers, maxFieldLength } =
    normalizeRedaction(options);
  return redactValue(value, redactKeys, sensitiveMarkers, maxFieldLength);
}

function redactHeaderValue(
  key: string,
  value: string,
  redactKeys: Set<string>
): string {
  if (redactKeys.has(key.toLowerCase())) {
    return "[REDACTED]";
  }
  return value;
}

export function redactHeaders(
  headers: Record<string, string>,
  options: RedactionOptions = {}
): Record<string, string> {
  const { redactKeys } = normalizeRedaction(options);
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    output[key] = redactHeaderValue(key, value, redactKeys);
  }
  return output;
}

export function auditNetworkRequest(
  logger: AuditLogger,
  meta: NetworkRequestAudit,
  actor: string
): void {
  const payload: Record<string, unknown> = {
    domain: meta.domain,
    method: meta.method,
    purpose: meta.purpose,
    bodyHash: meta.bodyHash,
    bodySummary: meta.bodySummary
  };
  if (meta.headers) {
    payload.headers = redactHeaders(meta.headers);
  }
  logger.log({
    timestamp: new Date().toISOString(),
    actor,
    action: "network.request",
    approved: meta.approved,
    target: meta.url,
    result: JSON.stringify(payload)
  });
}

export function auditNetworkResult(
  logger: AuditLogger,
  meta: NetworkResultAudit,
  actor: string,
  approved: boolean,
  url: string
): void {
  logger.log({
    timestamp: new Date().toISOString(),
    actor,
    action: "network.result",
    approved,
    target: url,
    result: JSON.stringify(meta)
  });
}

export class AuditLogger {
  private readonly logPath: string;
  private readonly redactKeys: Set<string>;
  private readonly sensitiveMarkers: string[];
  private readonly maxFieldLength: number;

  constructor(options: { logPath: string } & RedactionOptions) {
    this.logPath = options.logPath;
    const normalized = normalizeRedaction(options);
    this.redactKeys = normalized.redactKeys;
    this.sensitiveMarkers = normalized.sensitiveMarkers;
    this.maxFieldLength = normalized.maxFieldLength;
  }

  log(event: AuditEvent): void {
    const redacted = redactValue(
      event,
      this.redactKeys,
      this.sensitiveMarkers,
      this.maxFieldLength
    ) as AuditEvent;
    this.ensureLogDir();
    const line = JSON.stringify(redacted);
    fs.appendFileSync(this.logPath, `${line}\n`, {
      encoding: "utf8",
      flag: "a"
    });
  }

  private ensureLogDir(): void {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private redactValue(value: unknown): unknown {
    return redactValue(
      value,
      this.redactKeys,
      this.sensitiveMarkers,
      this.maxFieldLength
    );
  }
}
