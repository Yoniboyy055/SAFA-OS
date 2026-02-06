import type { AuditLogger } from "./audit";

export const MAX_MATURITY_LEVEL = 5 as const;

export function assertMaturityLevel(
  level: number,
  audit: AuditLogger,
  actor: string
): void {
  if (level > MAX_MATURITY_LEVEL) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "MATURITY_VIOLATION",
      approved: false,
      target: "maturity",
      result: `Requested maturity level ${level} exceeds max ${MAX_MATURITY_LEVEL}.`
    });
    throw new Error("Maturity level exceeds allowed maximum.");
  }
}

export function assertNoRecursivePlanning(
  hasFreshOwnerInput: boolean,
  audit: AuditLogger,
  actor: string
): void {
  if (!hasFreshOwnerInput) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "MATURITY_VIOLATION",
      approved: false,
      target: "planning",
      result: "Recursive planning without fresh owner input is blocked."
    });
    throw new Error("Recursive planning is blocked.");
  }
}
