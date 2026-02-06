import type { AuditLogger } from "./audit";

export const isAutonomous = false as const;
export const canInitiate = false as const;
export const canSetGoals = false as const;
export const canSelfModify = false as const;

export function assertBoundedIdentity(
  audit: AuditLogger,
  actor: string
): void {
  if (isAutonomous || canInitiate || canSetGoals || canSelfModify) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "IDENTITY_VIOLATION",
      approved: false,
      target: "identity",
      result: "Bounded identity violated."
    });
    throw new Error("Bounded identity violation.");
  }
}
