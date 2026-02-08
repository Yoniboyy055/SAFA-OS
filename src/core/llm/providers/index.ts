import type { LlmProvider } from "../types";
import { OpenAIProvider } from "./openai";

const providers: LlmProvider[] = [new OpenAIProvider()];

export function getProviders(): LlmProvider[] {
  return providers;
}

export function getProvider(id: string): LlmProvider | undefined {
  return providers.find((provider) => provider.id === id);
}
