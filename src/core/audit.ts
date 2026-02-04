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

const DEFAULT_REDACT_KEYS = [
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "authorization",
  "bearer",
  "key"
];

export class AuditLogger {
  private readonly logPath: string;
  private readonly redactKeys: Set<string>;
  private readonly sensitiveMarkers: string[];
  private readonly maxFieldLength: number;

  constructor(options: {
    logPath: string;
    redactKeys?: string[];
    maxFieldLength?: number;
  }) {
    this.logPath = options.logPath;
    const keys = options.redactKeys && options.redactKeys.length > 0
      ? options.redactKeys
      : DEFAULT_REDACT_KEYS;
    this.redactKeys = new Set(keys.map((key) => key.toLowerCase()));
    this.sensitiveMarkers = Array.from(this.redactKeys);
    this.maxFieldLength = options.maxFieldLength ?? 1000;
  }

  log(event: AuditEvent): void {
    const redacted = this.redactValue(event) as AuditEvent;
    this.ensureLogDir();
    const line = JSON.stringify(redacted);
    fs.appendFileSync(this.logPath, `${line}\n`, { encoding: "utf8" });
  }

  private ensureLogDir(): void {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private redactValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.redactValue(entry));
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const output: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(record)) {
        if (this.redactKeys.has(key.toLowerCase())) {
          output[key] = "[REDACTED]";
        } else {
          output[key] = this.redactValue(entry);
        }
      }
      return output;
    }
    if (typeof value === "string") {
      return this.redactString(value);
    }
    return value;
  }

  private redactString(value: string): string {
    const trimmed = value.length > this.maxFieldLength
      ? `${value.slice(0, this.maxFieldLength)}...[TRUNCATED]`
      : value;
    const lowered = trimmed.toLowerCase();
    if (this.sensitiveMarkers.some((marker) => lowered.includes(marker))) {
      return "[REDACTED]";
    }
    return trimmed;
  }
}
