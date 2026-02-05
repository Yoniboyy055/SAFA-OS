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
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
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

async function readResponseBody(
  response: Response,
  maxBytes: number
): Promise<{ text: string; bytes: number }> {
  if (!response.body) {
    return { text: "", bytes: 0 };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        reader.cancel().catch(() => undefined);
        throw new Error("Response exceeds maximum size.");
      }
      chunks.push(value);
    }
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder("utf-8").decode(buffer);
  return { text, bytes: total };
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
    { actor: context.actor, approved: context.approved },
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
      bodyBytes
    })
  });

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();
  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers: sanitizedHeaders,
      body: options.method === "POST" ? body : undefined,
      signal: controller.signal
    });
    const { text, bytes } = await readResponseBody(
      response,
      MAX_RESPONSE_BYTES
    );
    const durationMs = Date.now() - startTime;
    const responseHash = hashValue(text);

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "network.response",
      approved: context.approved,
      target: urlDecision.hostname,
      result: JSON.stringify({
        status: response.status,
        durationMs,
        responseHash,
        responseBytes: bytes
      })
    });

    return {
      status: response.status,
      bodyText: text,
      responseHash,
      responseBytes: bytes,
      durationMs
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Network request failed.";
    deny(reason);
  } finally {
    clearTimeout(timeout);
  }
}
