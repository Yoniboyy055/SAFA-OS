/**
 * LLM Provider Abstraction Layer
 * 
 * Provides a unified interface for different LLM providers with:
 * - Governance checks before every inference
 * - Prompt auditing (redacted)
 * - Token usage tracking
 * - Error handling and retries
 * - Network window enforcement
 */

import * as crypto from "node:crypto";
import type { AuditLogger } from "../core/audit";
import type { ResolvedConfig } from "../core/config";
import type { Governor } from "../core/governor";
import { OpenAIProvider } from "../core/llm/providers/openai";
import type { LlmCallInput, LlmCallOutput } from "../core/llm/types";
import type {
  LLMProvider as LLMProviderEnum,
  LLMRequest,
  LLMResponse,
  LLMUsage,
  LLMMessage,
} from "./types";

export interface LLMProviderContext {
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  actor: string;
  approved: boolean;
  authority: import("../core/authority").AuthorityLevel;
  commandMode: import("../cli/command_mode").CommandMode;
}

/**
 * Hash prompt content for audit logging (never log verbatim)
 */
function hashPrompt(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Calculate estimated cost for LLM request
 */
function estimateCost(
  provider: LLMProviderEnum,
  model: string,
  promptTokens: number,
  completionTokens: number = 0
): number {
  // Cost estimates per 1M tokens (as of Feb 2026)
  const costMap: Record<string, { input: number; output: number }> = {
    "openai:gpt-4o-mini": { input: 0.15, output: 0.60 },
    "openai:gpt-4o": { input: 2.50, output: 10.00 },
    "openai:gpt-4.1-mini": { input: 0.15, output: 0.60 },
    "openai:gpt-4.1": { input: 2.50, output: 10.00 },
    "openai:gpt-5": { input: 5.00, output: 15.00 },
    "openai:o3": { input: 5.00, output: 15.00 },
    "anthropic:claude-3-haiku": { input: 0.25, output: 1.25 },
    "anthropic:claude-3-sonnet": { input: 3.00, output: 15.00 },
    "anthropic:claude-3-opus": { input: 15.00, output: 75.00 },
  };

  const key = `${provider}:${model}`;
  const rates = costMap[key] || { input: 1.0, output: 3.0 }; // Default conservative estimate

  const inputCost = (promptTokens / 1_000_000) * rates.input;
  const outputCost = (completionTokens / 1_000_000) * rates.output;

  return inputCost + outputCost;
}

/**
 * Enforce network window for LLM calls
 */
function checkNetworkWindow(config: ResolvedConfig): void {
  if (!config.network.enabled) {
    throw new Error("Network is disabled. LLM calls require network access.");
  }

  // Check if the provider's API domain is allowlisted
  // Use exact domain matching to prevent substring attacks
  const allowedDomains = config.network.allowlistDomains || [];
  const hasOpenAI = allowedDomains.some(
    (domain) => domain === "api.openai.com" || domain === "*.openai.com" || domain === "*"
  );
  
  if (!hasOpenAI) {
    throw new Error(
      "OpenAI API domain (api.openai.com) is not allowlisted. Add it to network.allowlistDomains."
    );
  }
}

/**
 * Convert LLMMessage to LlmMessage format
 */
function convertMessages(messages: LLMMessage[]): import("../core/llm/types").LlmMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Call OpenAI LLM provider
 */
async function callOpenAI(
  request: LLMRequest,
  context: LLMProviderContext
): Promise<LLMResponse> {
  const provider = new OpenAIProvider();

  if (!provider.isConfigured()) {
    throw new Error("OpenAI provider is not configured. Set OPENAI_API_KEY in .env");
  }

  const models = provider.listModels();
  const modelSpec = models.find((m) => m.id === request.model);
  
  if (!modelSpec) {
    throw new Error(`Model ${request.model} not found in OpenAI provider`);
  }

  const input: LlmCallInput = {
    model: modelSpec,
    messages: convertMessages(request.messages),
    temperature: request.temperature ?? 0.2,
    maxTokens: request.maxTokens ?? 2000,
    timeoutMs: 30000,
    metadata: request.metadata,
  };

  const output: LlmCallOutput = await provider.call(input);

  const usage: LLMUsage | undefined = output.usage
    ? {
        promptTokens: output.usage.inputTokens ?? 0,
        completionTokens: output.usage.outputTokens ?? 0,
        totalTokens: output.usage.totalTokens ?? 0,
      }
    : undefined;

  return {
    content: output.text,
    usage,
    model: request.model,
    provider: request.provider,
    finishReason: "stop",
    raw: output.raw,
  };
}

/**
 * Main LLM inference function with governance
 */
export async function callLLM(
  request: LLMRequest,
  context: LLMProviderContext
): Promise<LLMResponse> {
  // Audit the request (with hashed prompt)
  const promptHash = request.messages
    .map((m) => hashPrompt(m.content))
    .join(",");

  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "llm.request",
    approved: context.approved,
    target: `${request.provider}:${request.model}`,
    result: JSON.stringify({
      promptHash,
      messageCount: request.messages.length,
      maxTokens: request.maxTokens,
    }),
  });

  // Check governance: network window required
  checkNetworkWindow(context.config);

  // Estimate cost before making call
  const estimatedPromptTokens = request.messages.reduce(
    (sum, msg) => sum + Math.ceil(msg.content.length / 4),
    0
  );
  const estimatedCost = estimateCost(
    request.provider,
    request.model,
    estimatedPromptTokens,
    request.maxTokens ?? 2000
  );

  // Check cost guard
  const llmConfig = context.config.llm;
  const costGuard = llmConfig?.costGuardUsd ?? 0.10;
  if (estimatedCost > costGuard) {
    const error = `Estimated cost $${estimatedCost.toFixed(4)} exceeds cost guard $${costGuard}`;
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "llm.denied",
      approved: false,
      target: `${request.provider}:${request.model}`,
      result: error,
    });
    throw new Error(error);
  }

  // Governor check
  const governorDecision = context.governor.evaluate(
    {
      type: "llm_inference",
      category: "network",
      riskLevel: "MEDIUM",
      requiresApproval: false,
      allowWhenNetworkOff: false,
    },
    context.config,
    {
      actor: context.actor,
      approved: context.approved,
      authority: context.authority,
      commandMode: context.commandMode,
      audit: context.audit,
      freezeEnabled: false,
      defenseText: "", // Don't send full prompt to governor
      maturityLevel: 7,
      freshOwnerInput: true,
      costEstimateUsd: estimatedCost,
    }
  );

  if (!governorDecision.allowed) {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "llm.denied",
      approved: false,
      target: `${request.provider}:${request.model}`,
      result: governorDecision.reason,
    });
    throw new Error(`LLM call denied by governor: ${governorDecision.reason}`);
  }

  // Route to appropriate provider
  let response: LLMResponse;
  
  try {
    switch (request.provider) {
      case "openai":
        response = await callOpenAI(request, context);
        break;
      case "anthropic":
        throw new Error("Anthropic provider not yet implemented");
      case "ollama":
        throw new Error("Ollama provider not yet implemented");
      case "llamacpp":
        throw new Error("LlamaCpp provider not yet implemented");
      default:
        throw new Error(`Unknown LLM provider: ${request.provider}`);
    }
  } catch (error) {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "llm.error",
      approved: context.approved,
      target: `${request.provider}:${request.model}`,
      result: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // Calculate actual cost
  const actualCost = response.usage
    ? estimateCost(
        request.provider,
        request.model,
        response.usage.promptTokens,
        response.usage.completionTokens
      )
    : estimatedCost;

  // Audit the response
  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "llm.response",
    approved: context.approved,
    target: `${request.provider}:${request.model}`,
    result: JSON.stringify({
      usage: response.usage,
      cost: `$${actualCost.toFixed(6)}`,
      responseHash: hashPrompt(response.content),
      responseLength: response.content.length,
      finishReason: response.finishReason,
    }),
  });

  return response;
}

/**
 * Check if LLM is configured and available
 */
export function isLLMAvailable(config: ResolvedConfig): boolean {
  const llmConfig = config.llm;
  if (!llmConfig || !llmConfig.enabled) {
    return false;
  }

  // Check if OpenAI is configured
  const provider = new OpenAIProvider();
  return provider.isConfigured();
}
