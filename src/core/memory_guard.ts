import type { AuditLogger } from "./audit";

export interface MemoryRecord {
  key: string;
  value: string;
  isSecret?: boolean;
  consent?: boolean;
}

export function assertMemoryWriteAllowed(
  record: MemoryRecord,
  audit: AuditLogger,
  actor: string
): void {
  if (record.isSecret && !record.consent) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "SECURITY_EVENT",
      approved: false,
      target: record.key,
      result: "Secret storage without consent is blocked."
    });
    throw new Error("Secret storage without consent is blocked.");
  }
}
