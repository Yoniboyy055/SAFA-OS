import * as crypto from "node:crypto";

import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import type { AuthorityLevel } from "../authority";
import type { CommandMode } from "../../cli/command_mode";
import type { NetworkWindowState } from "../network_window";
import { loadNetworkWindow } from "../network_window";
import { readFreezeState } from "../freeze";
import { getProvider } from "../llm/providers";
import { getModel } from "../llm/registry";
import { routeModel } from "../llm/router";
import type {
  CostTier,
  LlmMessage,
  LlmProviderId,
  Mode,
  RiskTier
} from "../llm/types";
import { redactSensitiveText } from "../sensitive";
import { assertNetworkGate } from "../network/gate";
import { assertOwnerCommandContext } from "../execution_gate";

export interface LiveModelContext {
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  actor: string;
  approved: boolean;
  authority: AuthorityLevel;
  commandMode: CommandMode;
  networkWindow?: NetworkWindowState;
  costEstimateUsd?: number;
  costCapUsd?: number;
}

export interface LiveModelRequest {
  providerId?: LlmProviderId;
  modelId?: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface LiveModelResponse {
  provider: string;
  model: string;
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface AutoRouteRequest {
  commandText: string;
  messages: LlmMessage[];
  budget: CostTier;
  risk: RiskTier;
  needsReasoning?: boolean;
  expectsLongContext?: boolean;
  mode?: Mode;
  manualProvider?: string;
  manualModel?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface AutoRouteResponse {
  policy: {
    mode: Mode;
    model: { provider: string; id: string };
    reason: string[];
  };
  output: LiveModelResponse;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function resolveEndpoint(providerId: LlmProviderId): string {
  if (providerId === "openai") {
    return "https://api.openai.com/v1/chat/completions";
  }
  throw new Error(`No endpoint registered for provider: ${providerId}`);
}

function summarizeMessages(messages: LlmMessage[]): string {
  return messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n")
    .slice(0, 2000);
}

function requireLiveNetwork(): void {
  if (process.env.SAFA_NETWORK_LIVE !== "1") {
    throw new Error("Live network disabled. Set SAFA_NETWORK_LIVE=1 to enable.");
  }
}

export async function connectLiveModel(
  request: LiveModelRequest,
  context: LiveModelContext
): Promise<LiveModelResponse> {
  assertOwnerCommandContext(context.audit, context.actor, "llm.call");
  const providerId = request.providerId ?? "openai";
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  if (!provider.isConfigured()) {
    throw new Error(`Provider ${providerId} is not configured.`);
  }
  const configuredModel =
    (request.modelId && getModel(providerId, request.modelId)) ||
    provider.listModels()[0];
  if (!configuredModel) {
    throw new Error("No model available for provider.");
  }

  const summary = summarizeMessages(request.messages);
  const redacted = redactSensitiveText(summary, {
    allowPii: false,
    redactKeys: context.config.audit.redactKeys
  });
  const networkWindow = context.networkWindow ?? loadNetworkWindow(context.config.rootDir);
  const freezeEnabled = readFreezeState(context.config.rootDir).enabled;
  const endpoint = resolveEndpoint(providerId);
  const bodyHash = hashValue(JSON.stringify(request.messages ?? []));
  const requestId = request.requestId ?? `llm-${bodyHash.slice(0, 12)}`;

  assertNetworkGate(context.config, context.audit, context.actor, endpoint);

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
      url: endpoint,
      headers: {},
      bodySummary: redacted.redactedText,
      bodyHash,
      riskLevel: "HIGH",
      requiresApproval: true,
      timeoutMs: request.timeoutMs
    }
  );

  if (!decision.allowed) {
    throw new Error(decision.reason);
  }
  requireLiveNetwork();

  const output = await provider.call({
    model: configuredModel,
    messages: request.messages,
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    timeoutMs: request.timeoutMs,
    requestId,
    metadata: request.metadata
  });

  const outputRedaction = redactSensitiveText(output.text ?? "", {
    allowPii: false,
    redactKeys: context.config.audit.redactKeys
  });
  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "llm.call",
    approved: context.approved,
    target: `${providerId}:${configuredModel.id}`,
    result: JSON.stringify({
      redacted: outputRedaction.redacted,
      preview: outputRedaction.redactedText.slice(0, 160),
      model: configuredModel.id
    })
  });

  return {
    provider: providerId,
    model: configuredModel.id,
    text: output.text ?? "",
    usage: output.usage
  };
}

export async function startAutoRoute(
  request: AutoRouteRequest,
  context: LiveModelContext
): Promise<AutoRouteResponse> {
  const policy = routeModel({
    mode: request.mode ?? "auto",
    commandText: request.commandText,
    budget: request.budget,
    risk: request.risk,
    needsReasoning: request.needsReasoning,
    expectsLongContext: request.expectsLongContext,
    manualProvider: request.manualProvider,
    manualModel: request.manualModel
  });

  const output = await connectLiveModel(
    {
      providerId: policy.model.provider,
      modelId: policy.model.id,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      timeoutMs: request.timeoutMs,
      requestId: request.requestId,
      metadata: request.metadata
    },
    context
  );

  return {
    policy: {
      mode: policy.mode,
      model: { provider: policy.model.provider, id: policy.model.id },
      reason: policy.reason
    },
    output
  };
}

export function getPhase12LockMessage(): string {
  return "PHASE_12_ACTIVE";
}
