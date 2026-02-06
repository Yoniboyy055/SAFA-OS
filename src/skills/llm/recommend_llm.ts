import type { SkillDefinition } from "../../types/skill";
import { LlmRouter, ModelOption } from "../../core/llm_router";

interface RecommendLlmInput {
  taskType: string;
  privacyRequirement: "local" | "hosted" | "any";
  maxBudgetUsd?: number;
  localAvailable?: boolean;
}

interface RecommendLlmOutput {
  recommendations: Array<{
    name: string;
    privacy: string;
    costBand: string;
    rationale: string;
  }>;
  note: string;
}

export const recommendLlmSkill: SkillDefinition<
  RecommendLlmInput,
  RecommendLlmOutput
> = {
  name: "recommend_llm",
  description: "Recommend LLMs by cost/privacy (advisory only).",
  inputSchema: {
    type: "object",
    required: ["taskType", "privacyRequirement"],
    properties: {
      taskType: { type: "string", description: "Task category." },
      privacyRequirement: {
        type: "string",
        description: "local | hosted | any"
      },
      maxBudgetUsd: { type: "number", description: "Budget cap (USD)." },
      localAvailable: { type: "boolean", description: "Local model available." }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "recommend_llm",
    target: (input) => input.taskType
  },
  handler: (input, context) => {
    const router = new LlmRouter();
    const options: ModelOption[] = [
      { name: "local-model", costPer1kTokensUsd: 0, privacy: "local" },
      { name: "gpt", costPer1kTokensUsd: 0.02, privacy: "hosted" },
      { name: "claude", costPer1kTokensUsd: 0.03, privacy: "hosted" }
    ];
    const filtered = options.filter((option) => {
      if (input.privacyRequirement === "local") {
        return option.privacy === "local";
      }
      if (input.privacyRequirement === "hosted") {
        return option.privacy === "hosted";
      }
      return true;
    });
    const recommendations = router.recommendModels(filtered, {
      actor: context.actor,
      approved: context.approved,
      audit: context.audit,
      costCapUsd: input.maxBudgetUsd
    }, {
      localAvailable: input.localAvailable,
      maxBudgetUsd: input.maxBudgetUsd
    });
    return {
      recommendations,
      note:
        "Advisory only: no spending or model switching occurs without explicit approval."
    };
  }
};
