import * as crypto from "node:crypto";

import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";

export interface CallRequest {
  toNumber: string;
  intent: string;
  notes?: string;
  dryRun?: boolean;
}

export interface CallResult {
  mode: "DRY_RUN" | "REQUESTED";
  previewHash: string;
  requestId?: string;
}

export interface CallsClientContext {
  actor: string;
  approved: boolean;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
}

function hashPreview(payload: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function normalizeNumber(number: string): string {
  return number.trim();
}

function ensureNumberAllowlisted(
  number: string,
  allowlist: string[],
  name: string
): void {
  if (!allowlist || allowlist.length === 0) {
    throw new Error(`${name} allowlist is empty.`);
  }
  const normalized = normalizeNumber(number);
  if (!allowlist.includes(normalized)) {
    throw new Error(`${name} not allowlisted: ${number}`);
  }
}

function ensureCountryAllowlisted(number: string, allowlist: string[]): void {
  if (!allowlist || allowlist.length === 0) {
    throw new Error("Country allowlist is empty.");
  }
  const normalized = normalizeNumber(number);
  const matches = allowlist.some((entry) => {
    const prefix = entry.startsWith("+") ? entry : `+${entry}`;
    return normalized.startsWith(prefix);
  });
  if (!matches) {
    throw new Error("Country not allowlisted for number.");
  }
}

export async function makeCall(
  request: CallRequest,
  context: CallsClientContext
): Promise<CallResult> {
  const dryRun =
    typeof request.dryRun === "boolean"
      ? request.dryRun
      : context.config.calls.dryRunDefault;

  const governorDecision = context.governor.evaluate(
    {
      type: "make_call",
      category: "external_tool",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: dryRun
    },
    context.config,
    { actor: context.actor, approved: context.approved }
  );

  if (!governorDecision.allowed) {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: "calls",
      result: governorDecision.reason
    });
    throw new Error(governorDecision.reason);
  }

  if (context.config.calls.provider !== "twilio") {
    const reason = "Call provider is not supported.";
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: "calls",
      result: reason
    });
    throw new Error(reason);
  }

  if (!context.config.calls.fromNumberAllowlist.length) {
    const reason = "From number allowlist is empty.";
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: "calls",
      result: reason
    });
    throw new Error(reason);
  }

  ensureNumberAllowlisted(
    request.toNumber,
    context.config.calls.toNumberAllowlist,
    "To number"
  );
  ensureCountryAllowlisted(
    request.toNumber,
    context.config.calls.countryAllowlist
  );

  const previewHash = hashPreview({
    toNumber: request.toNumber,
    intent: request.intent
  });

  if (dryRun) {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.preview",
      approved: context.approved,
      target: "calls",
      result: previewHash
    });
    return {
      mode: "DRY_RUN",
      previewHash
    };
  }

  if (!context.config.calls.enabled) {
    const reason = "Calls are disabled by configuration.";
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: "calls",
      result: reason
    });
    throw new Error(reason);
  }

  if (!context.config.network.enabled) {
    const reason = "Network disabled";
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: "calls",
      result: reason
    });
    throw new Error(reason);
  }

  const allowlisted = context.config.network.allowlistDomains.some((domain) => {
    const normalized = domain.toLowerCase();
    return normalized === "twilio.com" || normalized.endsWith(".twilio.com");
  });
  if (!allowlisted) {
    const reason = "Call provider domain is not allowlisted.";
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: "calls",
      result: reason
    });
    throw new Error(reason);
  }

  const requestId = `call-${previewHash.slice(0, 12)}`;
  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "request.created",
    approved: context.approved,
    target: "calls",
    result: requestId
  });

  return {
    mode: "REQUESTED",
    previewHash,
    requestId
  };
}
