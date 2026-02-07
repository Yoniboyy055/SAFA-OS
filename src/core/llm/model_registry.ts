export type ModelId =
  | "openai:gpt-4o-mini"
  | "openai:gpt-4o"
  | "openai:gpt-4.1"
  | "openai:gpt-5"
  | "openai:o3";

export type ModelTag = "core" | "vision" | "code" | "reason";

export interface ModelSpec {
  id: ModelId;
  provider: "openai";
  model: string;
  tags: ModelTag[];
  est_cost_tier: "low" | "medium" | "high" | "premium";
  max_tokens_hint: number;
}

export const registry: Record<ModelId, ModelSpec> = {
  "openai:gpt-4o-mini": {
    id: "openai:gpt-4o-mini",
    provider: "openai",
    model: "gpt-4o-mini",
    tags: ["core"],
    est_cost_tier: "low",
    max_tokens_hint: 128000
  },
  "openai:gpt-4o": {
    id: "openai:gpt-4o",
    provider: "openai",
    model: "gpt-4o",
    tags: ["vision"],
    est_cost_tier: "high",
    max_tokens_hint: 128000
  },
  "openai:gpt-4.1": {
    id: "openai:gpt-4.1",
    provider: "openai",
    model: "gpt-4.1",
    tags: ["code"],
    est_cost_tier: "high",
    max_tokens_hint: 128000
  },
  "openai:gpt-5": {
    id: "openai:gpt-5",
    provider: "openai",
    model: "gpt-5",
    tags: ["reason"],
    est_cost_tier: "premium",
    max_tokens_hint: 128000
  },
  "openai:o3": {
    id: "openai:o3",
    provider: "openai",
    model: "o3",
    tags: ["reason"],
    est_cost_tier: "premium",
    max_tokens_hint: 128000
  }
};

export function listModels(): ModelSpec[] {
  return Object.values(registry);
}

export function getModel(id: ModelId): ModelSpec {
  return registry[id];
}

export function findModelByTag(tag: ModelTag): ModelSpec | undefined {
  return listModels().find((model) => model.tags.includes(tag));
}

export function isModelId(value: string): value is ModelId {
  return Object.prototype.hasOwnProperty.call(registry, value);
}
