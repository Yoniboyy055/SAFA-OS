import * as crypto from "node:crypto";

import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";

export interface StripePaymentRequest {
  priceId?: string;
  amountCents?: number;
  currency?: string;
  customerEmail?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface StripePaymentResult {
  mode: "DRY_RUN" | "REQUESTED";
  previewHash: string;
  paymentUrl?: string;
  requestId?: string;
}

export interface StripeClientContext {
  actor: string;
  approved: boolean;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
}

function hashPreview(payload: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function matchesEmailPattern(address: string, pattern: string): boolean {
  const normalized = normalizeEmail(address);
  const normalizedPattern = normalizeEmail(pattern);
  if (!normalizedPattern.includes("*")) {
    return normalized === normalizedPattern;
  }
  if (!normalizedPattern.startsWith("*@")) {
    return false;
  }
  const domainPattern = normalizedPattern.slice(2);
  const parts = normalized.split("@");
  if (parts.length < 2) {
    return false;
  }
  const domain = parts[1];
  if (domainPattern.startsWith("*.")) {
    const suffix = domainPattern.slice(1);
    return domain.endsWith(suffix);
  }
  return domain === domainPattern;
}

function ensureAllowlisted(
  value: string | number | undefined,
  allowlist: string[],
  name: string
): void {
  if (value === undefined || value === null) {
    return;
  }
  if (!allowlist || allowlist.length === 0) {
    throw new Error(`${name} allowlist is empty.`);
  }
  const stringValue = String(value);
  if (!allowlist.includes(stringValue)) {
    throw new Error(`${name} not allowlisted: ${stringValue}`);
  }
}

function ensureEmailAllowlisted(
  email: string | undefined,
  allowlist: string[]
): void {
  if (!email) {
    return;
  }
  if (!allowlist || allowlist.length === 0) {
    throw new Error("Customer email allowlist is empty.");
  }
  if (!allowlist.some((pattern) => matchesEmailPattern(email, pattern))) {
    throw new Error("Customer email not allowlisted.");
  }
}

export async function requestPayment(
  request: StripePaymentRequest,
  context: StripeClientContext
): Promise<StripePaymentResult> {
  const dryRun =
    typeof request.dryRun === "boolean"
      ? request.dryRun
      : context.config.stripe.dryRunDefault;

  const currency = (request.currency ?? "usd").toLowerCase();
  const governorDecision = context.governor.evaluate(
    {
      type: "request_payment",
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
      target: "stripe",
      result: governorDecision.reason
    });
    throw new Error(governorDecision.reason);
  }

  ensureAllowlisted(
    request.priceId,
    context.config.permissions.stripePriceAllowlist,
    "Price"
  );
  ensureAllowlisted(
    request.amountCents,
    context.config.permissions.stripeAmountAllowlist,
    "Amount"
  );
  ensureAllowlisted(
    currency,
    context.config.permissions.stripeCurrencyAllowlist,
    "Currency"
  );
  ensureEmailAllowlisted(
    request.customerEmail,
    context.config.permissions.stripeCustomerEmailAllowlist
  );

  const previewHash = hashPreview({
    priceId: request.priceId ?? null,
    amountCents: request.amountCents ?? null,
    currency,
    customerEmail: request.customerEmail ?? null
  });

  if (dryRun) {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.preview",
      approved: context.approved,
      target: "stripe",
      result: previewHash
    });
    return {
      mode: "DRY_RUN",
      previewHash
    };
  }

  if (!context.config.stripe.enabled) {
    const reason = "Stripe is disabled by configuration.";
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: "stripe",
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
      target: "stripe",
      result: reason
    });
    throw new Error(reason);
  }

  let apiHost = "";
  try {
    apiHost = new URL(context.config.stripe.apiBase).hostname;
  } catch {
    apiHost = "";
  }
  const allowlisted = context.config.network.allowlistDomains.some((domain) => {
    const normalized = domain.toLowerCase();
    const host = apiHost.toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
  if (!apiHost || !allowlisted) {
    const reason = "Stripe API host is not allowlisted.";
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: "stripe",
      result: reason
    });
    throw new Error(reason);
  }

  const requestId = `stripe-${previewHash.slice(0, 12)}`;
  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "request.created",
    approved: context.approved,
    target: "stripe",
    result: requestId
  });

  return {
    mode: "REQUESTED",
    previewHash,
    requestId,
    paymentUrl: `payment://stripe/${previewHash.slice(0, 12)}`
  };
}
