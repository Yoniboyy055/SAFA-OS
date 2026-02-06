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
  const maxPayloadBytes =
    typeof overrides?.maxRequestBytes === "number"
      ? Math.min(overrides.maxRequestBytes, config.governance.maxNetworkPayloadBytes)
      : config.governance.maxNetworkPayloadBytes;

  return {
    allowedMethods: ["GET", "POST"],
    timeoutMs: overrides?.timeoutMs ?? 10_000,
    maxPayloadBytes,
    maxResponseBytes: overrides?.maxResponseBytes ?? 256 * 1024
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
