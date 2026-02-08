import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import type { NetworkRequest, NetworkResponseMeta } from "./types";
import { auditNetworkRequest, auditNetworkResult } from "../audit";
import { buildNetworkPolicy, validateMethod } from "./policy";
import { readFreezeState } from "../freeze";
import { loadNetworkWindow } from "../network_window";
import { estimatePayloadBytes } from "./types";
import * as crypto from "node:crypto";

export interface NetworkClientContext {
  actor: string;
  approved: boolean;
  authority: import("../authority").AuthorityLevel;
  commandMode: import("../../cli/command_mode").CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function performLiveRequest(
  request: NetworkRequest,
  policy: ReturnType<typeof buildNetworkPolicy>
): Promise<NetworkResponseMeta> {
  const timeoutMs = request.timeoutMs ?? policy.timeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  const body = request.bodySummary ?? "";
  const bodyBytes = estimatePayloadBytes(body);
  if (bodyBytes > policy.maxPayloadBytes) {
    throw new Error(`Payload exceeds max of ${policy.maxPayloadBytes} bytes.`);
  }

  try {
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method.toUpperCase() === "GET" ? undefined : body,
      signal: controller.signal
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > policy.maxResponseBytes) {
      throw new Error(`Response exceeds max of ${policy.maxResponseBytes} bytes.`);
    }
    const durationMs = Date.now() - start;
    return {
      status: res.status,
      bytes: buffer.byteLength,
      durationMs,
      responseHash: hashBuffer(buffer)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestNetwork(
  request: NetworkRequest,
  context: NetworkClientContext
): Promise<NetworkResponseMeta> {
  const policy = buildNetworkPolicy(context.config);
  const methodDecision = validateMethod(request.method, policy);
  const networkWindow = loadNetworkWindow(context.config.rootDir);

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
      networkWindow,
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

  let response: NetworkResponseMeta;
  if (process.env.JARVIS_NETWORK_LIVE === "1") {
    response = await performLiveRequest(request, policy);
  } else {
    response = {
      status: 0,
      bytes: 0,
      durationMs: 0,
      responseHash: "stub"
    };
  }

  auditNetworkResult(
    context.audit,
    response,
    context.actor,
    context.approved,
    request.url
  );

  return response;
}
