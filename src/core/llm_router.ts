import type { AuditLogger } from "./audit";
import { assertCostWithinBudget } from "./cost_guard";

export interface ModelOption {
  name: string;
  costPer1kTokensUsd: number;
  privacy: "local" | "hosted";
}

export interface RouterContext {
  actor: string;
  approved: boolean;
  audit: AuditLogger;
  costCapUsd?: number;
}

export class LlmRouter {
  recommendModel(options: ModelOption[], context: RouterContext): ModelOption {
    if (options.length === 0) {
      throw new Error("No model options provided.");
    }
    const sorted = [...options].sort((a, b) => a.costPer1kTokensUsd - b.costPer1kTokensUsd);
    const selected = sorted[0];
    const estimatedCost = selected.costPer1kTokensUsd;
    assertCostWithinBudget(estimatedCost, {
      actor: context.actor,
      approved: context.approved,
      audit: context.audit,
      costCapUsd: context.costCapUsd
    });
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "llm.recommendation",
      approved: context.approved,
      target: selected.name,
      result: `Estimated cost per 1k tokens: ${estimatedCost}`
    });
    return selected;
  }
}
