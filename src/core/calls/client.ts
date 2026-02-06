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
  plan?: {
    method: "POST";
    url: string;
    body: string;
  };
}

export interface CallsClientContext {
  actor: string;
  approved: boolean;
  authority: import("../authority").AuthorityLevel;
  commandMode: import("../../cli/command_mode").CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  costEstimateUsd?: number;
  costCapUsd?: number;
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
    {
      actor: context.actor,
      approved: context.approved,
      authority: context.authority,
      commandMode: context.commandMode,
      audit: context.audit,
      defenseText: request.notes ?? "",
      maturityLevel: 5,
      freshOwnerInput: true,
      costEstimateUsd: context.costEstimateUsd ?? 0,
      costCapUsd: context.costCapUsd
    }
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

  const twimlUrl = context.config.calls.twimlUrl;
  if (!twimlUrl) {
    const reason = "TwiML URL is required.";
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
  if (
    !context.config.permissions.callTemplateAllowlist.includes(twimlUrl)
  ) {
    const reason = "TwiML URL is not allowlisted.";
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

  const previewHash = hashPreview({
    toNumber: request.toNumber,
    intent: request.intent,
    twimlUrl
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
      previewHash,
      plan: {
        method: "POST",
        url: "https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls.json",
        body: `To=${request.toNumber}&From=<ALLOWLISTED>&Url=${twimlUrl}`
      }
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

  const reason = "Call live execution is disabled in Phase 3.";
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
