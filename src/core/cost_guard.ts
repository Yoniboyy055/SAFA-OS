import type { AuditLogger } from "./audit";

export interface CostGuardContext {
  actor: string;
  approved: boolean;
  audit: AuditLogger;
  costCapUsd?: number;
}

export function assertCostWithinBudget(
  estimatedCostUsd: number,
  context: CostGuardContext
): void {
  if (!estimatedCostUsd || estimatedCostUsd <= 0) {
    return;
  }
  const cap = context.costCapUsd ?? 0;
  if (cap > 0 && estimatedCostUsd > cap) {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "COST_REFUSAL",
      approved: context.approved,
      target: "cost",
      result: `Estimated cost ${estimatedCostUsd} exceeds cap ${cap}.`
    });
    throw new Error("Cost cap exceeded.");
  }
  if (!context.approved && cap <= 0) {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "COST_REFUSAL",
      approved: context.approved,
      target: "cost",
      result: "Paid action requires approval or pre-authorized cap."
    });
    throw new Error("Paid action requires approval.");
  }
}
