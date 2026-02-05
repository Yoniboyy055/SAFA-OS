import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { requestPayment } from "../../core/stripe/client";

interface RequestPaymentInput {
  priceId?: string;
  amountCents?: number;
  currency?: string;
  customerEmail?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
}

interface RequestPaymentOutput {
  mode: "DRY_RUN" | "REQUESTED";
  previewHash: string;
  paymentUrl?: string;
  requestId?: string;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export const requestPaymentSkill: SkillDefinition<
  RequestPaymentInput,
  RequestPaymentOutput
> = {
  name: "request_payment",
  description: "Create a Stripe payment request (governed, dry-run capable).",
  inputSchema: {
    type: "object",
    required: [],
    properties: {
      priceId: { type: "string", description: "Stripe price ID." },
      amountCents: { type: "number", description: "Amount in cents." },
      currency: { type: "string", description: "Currency code." },
      customerEmail: { type: "string", description: "Customer email." },
      description: { type: "string", description: "Payment description." },
      metadata: { type: "object", description: "Metadata for request." },
      dryRun: { type: "boolean", description: "Dry run preview." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: false,
  category: "external_tool",
  auditTemplate: {
    action: "request_payment",
    target: (input) =>
      input.customerEmail ? input.customerEmail : input.priceId ?? "payment"
  },
  handler: async (input, context) => {
    if (!input.priceId && typeof input.amountCents !== "number") {
      throw new Error("priceId or amountCents is required.");
    }

    const currency = (input.currency ?? "usd").toLowerCase();
    const descriptionHash = input.description
      ? hashValue(input.description)
      : "";

    const result = await requestPayment(
      {
        priceId: input.priceId,
        amountCents: input.amountCents,
        currency,
        customerEmail: input.customerEmail,
        description: input.description,
        metadata: input.metadata,
        dryRun: input.dryRun
      },
      {
        actor: context.actor,
        approved: context.approved,
        config: context.config,
        audit: context.audit,
        governor: context.governor
      }
    );

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request_payment",
      approved: context.approved,
      target: input.customerEmail ?? input.priceId ?? "payment",
      result: JSON.stringify({
        previewHash: result.previewHash,
        paymentUrl: result.paymentUrl ?? null,
        requestId: result.requestId ?? null,
        currency: currency ?? null,
        descriptionHash,
        dryRun: typeof input.dryRun === "boolean"
          ? input.dryRun
          : context.config.stripe.dryRunDefault
      })
    });

    return result;
  }
};
