import type { LlmModelSpec, Mode } from "./types";
import { decideModel, type RouteContext, type RouteDecision } from "./policy";
import { getModel } from "./registry";

export interface RouterInput extends RouteContext {
  mode: Mode;
  manualProvider?: string;
  manualModel?: string;
}

export interface RouterOutput extends RouteDecision {
  mode: Mode;
}

export function routeModel(input: RouterInput): RouterOutput {
  if (input.mode === "manual") {
    const provider = (input.manualProvider || "openai") as "openai";
    const modelId = input.manualModel || "gpt-4o-mini";
    const found = getModel(provider, modelId);
    const model: LlmModelSpec =
      found ??
      ({
        provider,
        id: modelId,
        label: modelId,
        cost: input.budget,
        reasoning: false
      } as LlmModelSpec);
    return {
      mode: "manual",
      model,
      reason: [`Manual selection -> ${model.provider}:${model.id}`]
    };
  }

  const auto = decideModel(input);
  return { mode: "auto", ...auto };
}
