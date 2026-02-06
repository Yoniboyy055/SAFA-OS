import * as crypto from "node:crypto";

import { redactHeaders } from "../audit";
import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import type { NetworkRequest } from "./types";
import { validatePayloadSize, validateUrl } from "./types";

export interface NetworkRequestOptions {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  purpose: string;
}

export interface NetworkResponse {
  status: number;
  bodyText: string;
  responseHash: string;
  responseBytes: number;
  durationMs: number;
}

export interface NetworkRequestContext {
  actor: string;
  approved: boolean;
  authority: import("../authority").AuthorityLevel;
  commandMode: import("../../cli/command_mode").CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  defenseText?: string;
  costEstimateUsd?: number;
  costCapUsd?: number;
}

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const RATE_LIMIT_PER_MIN = 10;
const rateLimitMap = new Map<string, number[]>();
const FORBIDDEN_HEADERS = [
  "host",
  "connection",
  "proxy-authorization",
  "proxy-connection",
  "upgrade",
  "transfer-encoding",
  "keep-alive",
  "content-length"
];

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function enforceRateLimit(hostname: string): void {
  const now = Date.now();
  const windowStart = now - 60_000;
  const entries = rateLimitMap.get(hostname) ?? [];
  const recent = entries.filter((timestamp) => timestamp >= windowStart);
  if (recent.length >= RATE_LIMIT_PER_MIN) {
    throw new Error("Network rate limit exceeded.");
  }
  recent.push(now);
  rateLimitMap.set(hostname, recent);
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_HEADERS.includes(lower)) {
      continue;
    }
    if (typeof value !== "string") {
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

function buildStubResponse(): NetworkResponse {
  return {
    status: 0,
    bodyText: "",
    responseHash: "stub",
    responseBytes: 0,
    durationMs: 0
  };
}

export async function requestNetwork(
  options: NetworkRequestOptions,
  context: NetworkRequestContext
): Promise<NetworkResponse> {
  const deny = (reason: string): never => {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: options.url,
      result: reason
    });
    throw new Error(reason);
  };

  if (!context.config.network.enabled) {
    deny("Network disabled");
  }

  if (options.method !== "GET" && options.method !== "POST") {
    deny("Method not allowlisted.");
  }

  const urlDecision = validateUrl(options.url, {
    allowlistDomains: context.config.network.allowlistDomains,
    allowlistUrls: context.config.network.allowlistUrls,
    allowHttp: false,
    maxPayloadBytes: context.config.governance.maxNetworkPayloadBytes
  });
  if (!urlDecision.allowed) {
    deny(urlDecision.reason);
  }

  const body = options.body ?? "";
  const bodyBytes = new TextEncoder().encode(body).length;
  const effectiveMaxPayload = Math.min(
    MAX_REQUEST_BYTES,
    context.config.governance.maxNetworkPayloadBytes
  );
  const payloadDecision = validatePayloadSize(body, effectiveMaxPayload);
  if (!payloadDecision.allowed) {
    deny(payloadDecision.reason);
  }

  const networkRequest: NetworkRequest = {
    id: `net-${hashValue(options.url).slice(0, 12)}`,
    purpose: options.purpose,
    method: options.method,
    url: options.url,
    headers: options.headers ?? {},
    bodySummary: body,
    bodyHash: hashValue(body),
    riskLevel: "HIGH",
    requiresApproval: true
  };

  const governorDecision = context.governor.evaluate(
    {
      type: "network_request",
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
      defenseText: context.defenseText,
      maturityLevel: 5,
      freshOwnerInput: true,
      costEstimateUsd: context.costEstimateUsd ?? 0,
      costCapUsd: context.costCapUsd
    },
    networkRequest
  );
  if (!governorDecision.allowed) {
    deny(governorDecision.reason);
  }

  try {
    enforceRateLimit(urlDecision.hostname);
  } catch (error) {
    deny(error instanceof Error ? error.message : String(error));
  }

  const sanitizedHeaders = sanitizeHeaders(options.headers ?? {});
  const urlHash = hashValue(urlDecision.normalizedUrl || options.url);
  const bodyHash = hashValue(body);
  const costEstimateUsd = context.costEstimateUsd ?? 0;

  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "network.request",
    approved: context.approved,
    target: urlDecision.hostname,
    result: JSON.stringify({
      urlHash,
      method: options.method,
      headerKeys: Object.keys(sanitizedHeaders),
      headers: redactHeaders(sanitizedHeaders),
      bodyHash,
      bodyBytes,
      costEstimateUsd
    })
  });

  const response = buildStubResponse();
  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "network.response",
    approved: context.approved,
    target: urlDecision.hostname,
    result: JSON.stringify({
      status: response.status,
      durationMs: response.durationMs,
      responseHash: response.responseHash,
      responseBytes: response.responseBytes
    })
  });
  return response;
}
