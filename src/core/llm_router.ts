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

export interface ModelRecommendation {
  name: string;
  privacy: "local" | "hosted";
  costBand: "free" | "low" | "medium" | "high";
  rationale: string;
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

  recommendModels(
    options: ModelOption[],
    context: RouterContext,
    preferences?: { localAvailable?: boolean; maxBudgetUsd?: number }
  ): ModelRecommendation[] {
    if (options.length === 0) {
      throw new Error("No model options provided.");
    }
    const sorted = [...options].sort((a, b) => {
      if (a.privacy !== b.privacy) {
        return a.privacy === "local" ? -1 : 1;
      }
      return a.costPer1kTokensUsd - b.costPer1kTokensUsd;
    });
    const recommendations = sorted.map((option) => {
      const costBand: ModelRecommendation["costBand"] =
        option.costPer1kTokensUsd === 0
          ? "free"
          : option.costPer1kTokensUsd <= 0.002
            ? "low"
            : option.costPer1kTokensUsd <= 0.02
              ? "medium"
              : "high";
      const rationaleParts = [
        option.privacy === "local" ? "Local-first" : "Hosted model",
        `Cost band: ${costBand}`
      ];
      if (preferences?.maxBudgetUsd !== undefined) {
        rationaleParts.push(`Budget cap: ${preferences.maxBudgetUsd}`);
      }
      return {
        name: option.name,
        privacy: option.privacy,
        costBand,
        rationale: rationaleParts.join(". ")
      };
    });
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "llm.recommendation",
      approved: context.approved,
      target: "llm",
      result: "Recommendations generated."
    });
    return recommendations;
  }
}
