import type { AuditLogger } from "./audit";

export enum AuthorityLevel {
  OWNER = "OWNER",
  SYSTEM = "SYSTEM",
  TOOL = "TOOL"
}

export function assertOwnerAuthority(
  authority: AuthorityLevel | undefined,
  audit: AuditLogger,
  actor: string
): void {
  if (authority !== AuthorityLevel.OWNER) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "AUTHORITY_VIOLATION",
      approved: false,
      target: "authority",
      result: "Owner authority is required for execution."
    });
    throw new Error("Owner authority is required.");
  }
}
