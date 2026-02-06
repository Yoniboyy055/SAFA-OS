import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import type {
  NetworkDecision,
  NetworkRequest,
  NetworkResponseMeta
} from "./types";
import { auditNetworkRequest, auditNetworkResult } from "../audit";
import { validatePayloadSize, validateUrl } from "./types";

export interface NetworkClientContext {
  actor: string;
  approved: boolean;
  authority: import("../authority").AuthorityLevel;
  commandMode: import("../../cli/command_mode").CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
}

function buildDecision(
  decision: NetworkDecision,
  request: NetworkRequest
): NetworkDecision {
  if (!decision.allowed) {
    return decision;
  }
  if (!request.url) {
    return {
      allowed: false,
      reason: "Request URL is required."
    };
  }
  return decision;
}

export async function requestNetwork(
  request: NetworkRequest,
  context: NetworkClientContext
): Promise<NetworkResponseMeta> {
  const urlDecision = validateUrl(request.url, {
    allowlistDomains: context.config.network.allowlistDomains,
    allowlistUrls: context.config.network.allowlistUrls,
    allowHttp: false,
    maxPayloadBytes: context.config.governance.maxNetworkPayloadBytes
  });

  const payloadDecision = validatePayloadSize(
    request.bodySummary,
    context.config.governance.maxNetworkPayloadBytes
  );

  const governorDecision = context.governor.evaluate(
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
      defenseText: request.bodySummary,
      maturityLevel: 5,
      freshOwnerInput: true,
      costEstimateUsd: 0
    },
    request
  );

  const decision = buildDecision(
    urlDecision.allowed
      ? payloadDecision.allowed
        ? governorDecision
        : payloadDecision
      : urlDecision,
    request
  );

  const domain = urlDecision.hostname || "unknown";
  auditNetworkRequest(
    context.audit,
    {
      url: urlDecision.normalizedUrl || request.url,
      domain,
      method: request.method,
      purpose: request.purpose,
      approved: context.approved,
      bodyHash: request.bodyHash,
      bodySummary: request.bodySummary.slice(0, 256),
      headers: request.headers
    },
    context.actor
  );

  if (!context.config.network.enabled) {
    throw new Error("Network disabled");
  }

  if (!decision.allowed) {
    throw new Error(decision.reason);
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
    urlDecision.normalizedUrl || request.url
  );

  return response;
}
