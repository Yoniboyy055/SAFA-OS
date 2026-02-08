export type LlmProviderId = "openai" | "anthropic" | "google";

export type LlmModelId =
  | "gpt-4o-mini"
  | "gpt-4o"
  | "gpt-4.1-mini"
  | "gpt-4.1"
  | string;

export type CostTier = "low" | "normal" | "high";
export type RiskTier = "safe" | "guarded" | "high";
export type Mode = "manual" | "auto";

export interface LlmModelSpec {
  provider: LlmProviderId;
  id: LlmModelId;
  label: string;
  cost: CostTier;
  reasoning: boolean;
  maxContextTokens?: number;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCallInput {
  model: LlmModelSpec;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface LlmCallOutput {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

export interface LlmProvider {
  id: LlmProviderId;
  isConfigured(): boolean;
  listModels(): LlmModelSpec[];
  call(input: LlmCallInput): Promise<LlmCallOutput>;
}
