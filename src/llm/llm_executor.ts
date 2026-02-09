import * as crypto from "node:crypto";

import type { AuditLogger } from "../core/audit";
import type { ResolvedConfig } from "../core/config";
import type { Governor } from "../core/governor";
import type { AuthorityLevel } from "../core/authority";
import type { CommandMode } from "../cli/command_mode";
import type {
  CostTier,
  LlmCallInput,
  LlmCallOutput,
  LlmMessage,
  LlmProvider,
  LlmProviderId,
  Mode,
  RiskTier
} from "../core/llm/types";
import { loadNetworkWindow } from "../core/network_window";
import { readFreezeState } from "../core/freeze";
import { redactSensitiveText } from "../core/sensitive";
import { routeModel } from "../core/llm/router";
import { assertNetworkGate } from "../core/network/gate";
import { assertOwnerCommandContext } from "../core/execution_gate";
import { assertLlmHostAllowed } from "./corridor";
import { getProvider } from "./providers";
import { appendMessage, readLlmSession } from "./llm_session";

export interface LlmExecutorContext {
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  actor: string;
  approved: boolean;
  authority: AuthorityLevel;
  commandMode: CommandMode;
  costEstimateUsd?: number;
  costCapUsd?: number;
}

export interface LlmExecutorInput {
  sessionId: string;
  mode: Mode;
  commandText: string;
  messages: LlmMessage[];
  budget: CostTier;
  risk: RiskTier;
  manualProvider?: LlmProviderId;
  manualModel?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LlmExecutorOutput {
  text: string;
  model: { provider: string; id: string };
  reason: string[];
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.toLowerCase().includes("timeout") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT")
  );
}

async function callWithRetry(
  provider: LlmProvider,
  input: LlmCallInput
): Promise<LlmCallOutput> {
  const delays = [250, 1000, 3000];
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await provider.call(input);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === delays.length) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  throw lastError ?? new Error("LLM call failed.");
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requireLiveNetwork(): void {
  if (process.env.SAFA_NETWORK_LIVE !== "1") {
    throw new Error("Live network disabled. Set SAFA_NETWORK_LIVE=1 to enable.");
  }
}

export async function executeLlmCall(
  input: LlmExecutorInput,
  context: LlmExecutorContext
): Promise<LlmExecutorOutput> {
  assertOwnerCommandContext(context.audit, context.actor, "llm.call");
  const session = readLlmSession(context.config.rootDir, input.sessionId);
  if (!session.approved && !context.approved) {
    throw new Error("LLM approval required for this session.");
  }

  const policy = routeModel({
    mode: input.mode,
    commandText: input.commandText,
    budget: input.budget,
    risk: input.risk,
    manualProvider: input.manualProvider,
    manualModel: input.manualModel
  });

  const providerId = policy.model.provider as LlmProviderId;
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  if (!provider.isConfigured()) {
    throw new Error(`Provider ${providerId} is not configured.`);
  }

  assertNetworkGate(context.config, context.audit, context.actor);
  assertLlmHostAllowed(context.config, providerId);

  const summary = input.messages
    .map((message) => message.content)
    .join("\n")
    .slice(0, 2000);
  const redacted = redactSensitiveText(summary, {
    allowPii: false,
    redactKeys: context.config.audit.redactKeys
  });

  const networkWindow = loadNetworkWindow(context.config.rootDir);
  const freezeEnabled = readFreezeState(context.config.rootDir).enabled;
  const bodyHash = hashValue(JSON.stringify(input.messages ?? []));
  const requestId = `llm-${bodyHash.slice(0, 12)}`;

  const decision = context.governor.evaluate(
    {
      type: "llm_call",
      category: "network",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: false
    },
    context.config,
    {
      actor: context.actor,
      approved: context.approved,
      authority: context.authority,
      commandMode: context.commandMode,
      audit: context.audit,
      networkWindow,
      freezeEnabled,
      defenseText: redacted.redactedText,
      maturityLevel: 5,
      freshOwnerInput: true,
      costEstimateUsd: context.costEstimateUsd ?? 0,
      costCapUsd: context.costCapUsd
    },
    {
      id: requestId,
      purpose: "llm_call",
      method: "POST",
      url: "https://llm-provider",
      headers: {},
      bodySummary: redacted.redactedText,
      bodyHash,
      riskLevel: "HIGH",
      requiresApproval: true,
      timeoutMs: input.timeoutMs
    }
  );

  if (!decision.allowed) {
    throw new Error(decision.reason);
  }

  requireLiveNetwork();

  const output = await callWithRetry(provider, {
    model: policy.model,
    messages: input.messages,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    timeoutMs: input.timeoutMs,
    requestId
  });

  appendMessage(context.config.rootDir, input.sessionId, {
    role: "assistant",
    content: output.text
  });

  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "llm.call",
    approved: context.approved,
    target: `${providerId}:${policy.model.id}`,
    result: JSON.stringify({
      model: policy.model.id,
      redacted: redacted.redacted,
      preview: redacted.redactedText.slice(0, 160)
    })
  });

  return {
    text: output.text,
    model: { provider: policy.model.provider, id: policy.model.id },
    reason: policy.reason
  };
}
