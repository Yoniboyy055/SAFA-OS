import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";

interface SendEmailRequestInput {
  to: string;
  subject: string;
  body: string;
}

interface SendEmailRequestOutput {
  draftId: string;
  to: string[];
  subject: string;
  body: string;
  bodyHash: string;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export const sendEmailRequestSkill: SkillDefinition<
  SendEmailRequestInput,
  SendEmailRequestOutput
> = {
  name: "send_email_request",
  description: "Create a governed email draft (stub-only, no send).",
  inputSchema: {
    type: "object",
    required: ["to", "subject", "body"],
    properties: {
      to: { type: "string", description: "Recipient email." },
      subject: { type: "string", description: "Email subject." },
      body: { type: "string", description: "Email body." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "outbound_message",
  auditTemplate: {
    action: "send_email_request",
    target: (input) => (Array.isArray(input.to) ? input.to.join(",") : input.to)
  },
  handler: async (input, context) => {
    const recipients = [input.to];
    const bodyHash = hashValue(input.body);
    const draftId = `draft-${hashValue(`${recipients.join(",")}:${input.subject}`).slice(0, 12)}`;

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "send_email_request.draft",
      approved: context.approved,
      target: recipients.join(","),
      result: JSON.stringify({
        draftId,
        subjectHash: hashValue(input.subject),
        bodyHash,
        recipients: recipients.length
      })
    });

    return {
      draftId,
      to: recipients,
      subject: input.subject,
      body: input.body,
      bodyHash
    };
  }
};
