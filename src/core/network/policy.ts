import type { ResolvedConfig } from "../config";
import type { NetworkDecision } from "./types";

export interface NetworkPolicy {
  allowedMethods: Array<"GET" | "POST">;
  timeoutMs: number;
  maxPayloadBytes: number;
  maxResponseBytes: number;
}

export function buildNetworkPolicy(
  config: ResolvedConfig,
  overrides?: Partial<NetworkPolicy> & {
    maxRequestBytes?: number;
    maxResponseBytes?: number;
    timeoutMs?: number;
  }
): NetworkPolicy {
  const defaultMaxBytes =
    typeof config.network.maxBytes === "number"
      ? config.network.maxBytes
      : 200000;
  const maxPayloadBytes =
    typeof overrides?.maxRequestBytes === "number"
      ? Math.min(overrides.maxRequestBytes, config.governance.maxNetworkPayloadBytes)
      : Math.min(defaultMaxBytes, config.governance.maxNetworkPayloadBytes);

  return {
    allowedMethods: ["GET", "POST"],
    timeoutMs:
      overrides?.timeoutMs ??
      (typeof config.network.timeoutMs === "number" ? config.network.timeoutMs : 10000),
    maxPayloadBytes,
    maxResponseBytes: overrides?.maxResponseBytes ?? defaultMaxBytes
  };
}

export function validateMethod(
  method: string,
  policy: NetworkPolicy
): NetworkDecision {
  const upper = method.toUpperCase();
  if (!policy.allowedMethods.includes(upper as "GET" | "POST")) {
    return {
      allowed: false,
      reason: "Method not allowlisted."
    };
  }
  return {
    allowed: true,
    reason: "Allowed."
  };
}
