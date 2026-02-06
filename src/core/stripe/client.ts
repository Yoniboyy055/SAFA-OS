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
  plan?: {
    method: "POST";
    url: string;
    body: string;
  };
}

export interface StripeClientContext {
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

function buildCheckoutBody(
  request: StripePaymentRequest,
  config: ResolvedConfig,
  currency: string
): string {
  if (!config.stripe.successUrl || !config.stripe.cancelUrl) {
    throw new Error("Stripe success_url and cancel_url are required.");
  }
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", config.stripe.successUrl);
  params.set("cancel_url", config.stripe.cancelUrl);
  if (request.priceId) {
    params.set("line_items[0][price]", request.priceId);
  } else if (typeof request.amountCents === "number") {
    params.set("line_items[0][price_data][currency]", currency);
    params.set("line_items[0][price_data][unit_amount]", String(request.amountCents));
    params.set(
      "line_items[0][price_data][product_data][name]",
      request.description ? request.description.slice(0, 50) : "Payment"
    );
  }
  params.set("line_items[0][quantity]", "1");
  if (request.customerEmail) {
    params.set("customer_email", request.customerEmail);
  }
  if (request.metadata) {
    const entries = Object.entries(request.metadata).slice(0, 10);
    for (const [key, value] of entries) {
      const safeKey = key.slice(0, 40);
      const safeValue =
        typeof value === "string" ? value.slice(0, 100) : String(value).slice(0, 100);
      params.set(`metadata[${safeKey}]`, safeValue);
    }
  }
  return params.toString();
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
    {
      actor: context.actor,
      approved: context.approved,
      authority: context.authority,
      commandMode: context.commandMode,
      audit: context.audit,
      defenseText: request.description ?? "",
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
    const url = new URL("/v1/checkout/sessions", context.config.stripe.apiBase).toString();
    const body = buildCheckoutBody(request, context.config, currency);
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
      previewHash,
      plan: {
        method: "POST",
        url,
        body
      }
    };
  }

  const reason = "Stripe live execution is disabled in Phase 3.";
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
