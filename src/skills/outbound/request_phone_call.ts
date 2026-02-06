import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";

interface RequestPhoneCallInput {
  toNumber: string;
  intent: string;
  script?: string;
}

interface RequestPhoneCallOutput {
  requestId: string;
  toNumber: string;
  intent: string;
  script: string;
  scriptHash: string;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export const requestPhoneCallSkill: SkillDefinition<
  RequestPhoneCallInput,
  RequestPhoneCallOutput
> = {
  name: "request_phone_call",
  description: "Create a governed call request (stub-only, no call).",
  inputSchema: {
    type: "object",
    required: ["toNumber", "intent"],
    properties: {
      toNumber: { type: "string", description: "Recipient phone number." },
      intent: { type: "string", description: "Call intent." },
      script: { type: "string", description: "Optional call script." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "outbound_message",
  auditTemplate: {
    action: "request_phone_call",
    target: (input) => input.toNumber
  },
  handler: async (input, context) => {
    const script =
      input.script ??
      `Call ${input.toNumber} regarding ${input.intent}.`;
    const scriptHash = hashValue(script);
    const requestId = `call-${hashValue(`${input.toNumber}:${input.intent}`).slice(0, 12)}`;

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request_phone_call.draft",
      approved: context.approved,
      target: input.toNumber,
      result: JSON.stringify({
        requestId,
        intent: input.intent,
        scriptHash
      })
    });

    return {
      requestId,
      toNumber: input.toNumber,
      intent: input.intent,
      script,
      scriptHash
    };
  }
};
