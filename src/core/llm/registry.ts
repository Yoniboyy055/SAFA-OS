import type { LlmModelSpec, LlmProviderId } from "./types";

const OPENAI_MODELS: LlmModelSpec[] = [
  {
    provider: "openai",
    id: "gpt-4o-mini",
    label: "GPT-4o mini (low)",
    cost: "low",
    reasoning: false,
    maxContextTokens: 128000
  },
  {
    provider: "openai",
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini (normal)",
    cost: "normal",
    reasoning: false,
    maxContextTokens: 128000
  },
  {
    provider: "openai",
    id: "gpt-4o",
    label: "GPT-4o (high)",
    cost: "high",
    reasoning: false,
    maxContextTokens: 128000
  },
  {
    provider: "openai",
    id: "gpt-4.1",
    label: "GPT-4.1 (high)",
    cost: "high",
    reasoning: false,
    maxContextTokens: 128000
  },
  {
    provider: "openai",
    id: "gpt-5",
    label: "GPT-5 (reasoning)",
    cost: "high",
    reasoning: true,
    maxContextTokens: 128000
  },
  {
    provider: "openai",
    id: "o3",
    label: "OpenAI o3 (reasoning)",
    cost: "high",
    reasoning: true,
    maxContextTokens: 128000
  }
];

export function listAllModels(): LlmModelSpec[] {
  return [...OPENAI_MODELS];
}

export function getModel(provider: LlmProviderId, id: string): LlmModelSpec | undefined {
  return listAllModels().find((model) => model.provider === provider && model.id === id);
}
