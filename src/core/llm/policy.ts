import type { CostTier, LlmModelSpec, RiskTier } from "./types";
import { listAllModels } from "./registry";

export interface RouteContext {
  commandText: string;
  skill?: string;
  budget: CostTier;
  risk: RiskTier;
  needsReasoning?: boolean;
  expectsLongContext?: boolean;
}

export interface RouteDecision {
  model: LlmModelSpec;
  reason: string[];
}

function pickByCost(models: LlmModelSpec[], budget: CostTier): LlmModelSpec[] {
  if (budget === "low") {
    return models.filter((model) => model.cost === "low" || model.cost === "normal");
  }
  if (budget === "normal") {
    return models.filter((model) => model.cost !== "high" || String(model.id).includes("4o"));
  }
  return models;
}

export function decideModel(context: RouteContext): RouteDecision {
  const reasons: string[] = [];
  let candidates = listAllModels().filter((model) => model.provider === "openai");

  candidates = pickByCost(candidates, context.budget);
  reasons.push(`Budget=${context.budget} applied to candidate set`);

  if (context.risk === "high") {
    const strong =
      candidates.find((model) => model.id === "gpt-4.1") ||
      candidates.find((model) => model.id === "gpt-4o");
    if (strong) {
      reasons.push("Risk=high -> selecting strongest available model");
      return { model: strong, reason: reasons };
    }
  }

  const text = context.commandText.toLowerCase();
  const codeSignals = [
    "ts",
    "typescript",
    "node",
    "server",
    "api",
    "bug",
    "error",
    "ci",
    "build",
    "test",
    "docker",
    "deploy"
  ];
  const isCode =
    codeSignals.some((signal) => text.includes(signal)) ||
    Boolean(context.skill && context.skill.toLowerCase().includes("code"));
  if (isCode) {
    const model =
      candidates.find((item) => item.id === "gpt-4.1-mini") ||
      candidates.find((item) => item.id === "gpt-4o-mini") ||
      candidates[0];
    reasons.push(
      "Detected engineering task -> prefer 4.1-mini (or closest) for reliable code + cost"
    );
    return { model, reason: reasons };
  }

  const cheapest = candidates.find((model) => model.id === "gpt-4o-mini") || candidates[0];
  reasons.push("Default routing -> fast/cheap model");
  return { model: cheapest, reason: reasons };
}
