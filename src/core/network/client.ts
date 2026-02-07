import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import type { NetworkRequest, NetworkResponseMeta } from "./types";
import { auditNetworkRequest, auditNetworkResult } from "../audit";
import { buildNetworkPolicy, validateMethod } from "./policy";
import { readFreezeState } from "../freeze";

export interface NetworkClientContext {
  actor: string;
  approved: boolean;
  authority: import("../authority").AuthorityLevel;
  commandMode: import("../../cli/command_mode").CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
}

export async function requestNetwork(
  request: NetworkRequest,
  context: NetworkClientContext
): Promise<NetworkResponseMeta> {
  const policy = buildNetworkPolicy(context.config);
  const methodDecision = validateMethod(request.method, policy);

  auditNetworkRequest(
    context.audit,
    {
      url: request.url,
      domain: request.url,
      method: request.method,
      purpose: request.purpose,
      approved: context.approved,
      bodyHash: request.bodyHash,
      bodySummary: request.bodySummary.slice(0, 256),
      headers: request.headers
    },
    context.actor
  );

  if (!methodDecision.allowed) {
    throw new Error(methodDecision.reason);
  }

  const freezeEnabled = readFreezeState(context.config.rootDir).enabled;
  const decision = context.governor.evaluate(
    {
      type: "network_request",
      category: "network",
      riskLevel: request.riskLevel,
      requiresApproval: request.requiresApproval,
      allowWhenNetworkOff: false
    },
    context.config,
    {
      actor: context.actor,
      approved: context.approved,
      authority: context.authority,
      commandMode: context.commandMode,
      audit: context.audit,
      freezeEnabled,
      defenseText: request.bodySummary,
      maturityLevel: 5,
      freshOwnerInput: true,
      costEstimateUsd: 0
    },
    request
  );

  if (!decision.allowed) {
    throw new Error(decision.reason);
  }

  if (!context.config.network.enabled) {
    throw new Error("Network disabled");
  }

  const response: NetworkResponseMeta = {
    status: 0,
    bytes: 0,
    durationMs: 0,
    responseHash: "stub"
  };

  auditNetworkResult(
    context.audit,
    response,
    context.actor,
    context.approved,
    request.url
  );

  return response;
}
