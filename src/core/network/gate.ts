import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import { validateUrl } from "./types";

function hasWildcard(values: string[] | undefined): boolean {
  return Array.isArray(values) && values.some((entry) => entry.trim() === "*");
}

function hasEmpty(values: string[] | undefined): boolean {
  return Array.isArray(values) && values.some((entry) => entry.trim().length === 0);
}

function logBlocked(
  audit: AuditLogger,
  actor: string,
  target: string,
  reason: string
): void {
  audit.log({
    timestamp: new Date().toISOString(),
    actor,
    action: "network.blocked",
    approved: false,
    target,
    result: reason
  });
}

export function assertNetworkGate(
  config: ResolvedConfig,
  audit: AuditLogger,
  actor: string,
  url?: string
): void {
  if (!config.network.enabled) {
    logBlocked(audit, actor, url ?? "network", "Network disabled.");
    throw new Error("Network disabled.");
  }

  const allowlistDomains = config.network.allowlistDomains ?? [];
  const allowlistUrls = config.network.allowlistUrls ?? [];

  if (hasEmpty(allowlistDomains) || hasEmpty(allowlistUrls)) {
    logBlocked(audit, actor, url ?? "network", "Network allowlist contains empty entry.");
    throw new Error("Network allowlist contains empty entry.");
  }

  if (hasWildcard(allowlistDomains) || hasWildcard(allowlistUrls)) {
    logBlocked(audit, actor, url ?? "network", "Network allowlist contains wildcard entry.");
    throw new Error("Network allowlist contains wildcard entry.");
  }

  if (allowlistDomains.length === 0 && allowlistUrls.length === 0) {
    logBlocked(audit, actor, url ?? "network", "Network allowlist is empty.");
    throw new Error("Network allowlist is empty.");
  }

  if (url) {
    const decision = validateUrl(url, {
      allowlistDomains,
      allowlistUrls,
      allowHttp: false,
      maxPayloadBytes: config.governance.maxNetworkPayloadBytes
    });
    if (!decision.allowed) {
      logBlocked(audit, actor, url, decision.reason);
      throw new Error(decision.reason);
    }
  }
}
