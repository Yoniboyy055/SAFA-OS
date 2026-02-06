import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { makeCall } from "../../core/calls/client";

interface MakeCallInput {
  toNumber: string;
  intent: "sales" | "support" | "follow_up" | "payment";
  notes?: string;
  dryRun?: boolean;
}

interface MakeCallOutput {
  mode: "DRY_RUN" | "REQUESTED" | "CREATED";
  previewHash: string;
  requestId?: string;
  callSid?: string;
  plan?: {
    method: "POST";
    url: string;
    body: string;
  };
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export const makeCallSkill: SkillDefinition<MakeCallInput, MakeCallOutput> = {
  name: "make_call",
  description: "Request a phone call (governed, dry-run capable).",
  inputSchema: {
    type: "object",
    required: ["toNumber", "intent"],
    properties: {
      toNumber: { type: "string", description: "Recipient phone number." },
      intent: {
        type: "string",
        description: "Call intent (sales/support/follow_up/payment)."
      },
      notes: { type: "string", description: "Optional notes." },
      dryRun: { type: "boolean", description: "Dry run preview." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "external_tool",
  auditTemplate: {
    action: "make_call",
    target: (input) => input.toNumber
  },
  handler: async (input, context) => {
    if (!input.toNumber || typeof input.toNumber !== "string") {
      throw new Error("toNumber is required.");
    }
    if (!input.intent || typeof input.intent !== "string") {
      throw new Error("intent is required.");
    }

    if (
      !context.config.permissions.callIntentAllowlist.includes(input.intent)
    ) {
      throw new Error("Call intent not allowlisted.");
    }

    const notesHash = input.notes ? hashValue(input.notes) : "";
    const result = await makeCall(
      {
        toNumber: input.toNumber,
        intent: input.intent,
        notes: input.notes,
        dryRun: input.dryRun
      },
      {
        actor: context.actor,
        approved: context.approved,
        authority: context.authority,
        commandMode: context.commandMode,
        config: context.config,
        audit: context.audit,
        governor: context.governor
      }
    );

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "make_call",
      approved: context.approved,
      target: input.toNumber,
      result: JSON.stringify({
        previewHash: result.previewHash,
        requestId: result.requestId ?? null,
        intent: input.intent,
        notesHash,
        dryRun: typeof input.dryRun === "boolean"
          ? input.dryRun
          : context.config.calls.dryRunDefault
      })
    });

    return result;
  }
};
