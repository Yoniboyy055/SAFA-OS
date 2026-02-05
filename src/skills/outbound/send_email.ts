import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import type { EmailMessage, EmailSendResult } from "../../core/email/types";
import { sendEmail } from "../../core/email/client";

interface SendEmailInput {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  dryRun?: boolean;
  tags?: string[];
}

interface SendEmailOutput extends EmailSendResult {
  recipientDomains: string[];
  subjectHash: string;
  bodyHash: string;
  bodySize: number;
}

const PREVIEW_LIMIT = 120;

function normalizeRecipients(value?: string | string[]): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getRecipientDomains(addresses: string[]): string[] {
  const domains = new Set<string>();
  for (const address of addresses) {
    const parts = address.split("@");
    if (parts.length > 1) {
      domains.add(parts[1].toLowerCase());
    }
  }
  return Array.from(domains.values());
}

function formatTarget(recipients: string[]): string {
  if (recipients.length === 0) {
    return "unknown";
  }
  const joined = recipients.join(", ");
  if (joined.length <= PREVIEW_LIMIT) {
    return joined;
  }
  return `${joined.slice(0, PREVIEW_LIMIT)}...[TRUNCATED]`;
}

export const sendEmailSkill: SkillDefinition<SendEmailInput, SendEmailOutput> = {
  name: "send_email",
  description: "Send an email via governed SMTP (supports dry-run).",
  inputSchema: {
    type: "object",
    required: ["to", "subject"],
    properties: {
      to: { type: "string", description: "Recipient email or list." },
      cc: { type: "string", description: "CC recipients." },
      bcc: { type: "string", description: "BCC recipients." },
      subject: { type: "string", description: "Email subject." },
      text: { type: "string", description: "Plain text body." },
      html: { type: "string", description: "HTML body." },
      dryRun: { type: "boolean", description: "Dry run only." },
      tags: { type: "array", description: "Tags for tracking." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: false,
  category: "outbound_message",
  auditTemplate: {
    action: "send_email",
    target: (input) => {
      const recipients = normalizeRecipients(input.to);
      return formatTarget(recipients);
    }
  },
  handler: async (input, context) => {
    const to = normalizeRecipients(input.to);
    const cc = normalizeRecipients(input.cc);
    const bcc = normalizeRecipients(input.bcc);
    if (to.length === 0) {
      throw new Error("At least one recipient is required.");
    }
    if (!input.subject || typeof input.subject !== "string") {
      throw new Error("Subject is required.");
    }
    if (!input.text && !input.html) {
      throw new Error("Either text or html content is required.");
    }

    const dryRun =
      typeof input.dryRun === "boolean"
        ? input.dryRun
        : context.config.email.dryRunDefault;

    const bodyContent = input.text ?? input.html ?? "";
    const subjectHash = hashValue(input.subject);
    const bodyHash = hashValue(bodyContent);
    const bodySize = bodyContent.length;
    const recipientDomains = getRecipientDomains([...to, ...cc, ...bcc]);

    const result = await sendEmail(
      {
        to,
        cc,
        bcc,
        subject: input.subject,
        text: input.text,
        html: input.html,
        dryRun,
        tags: input.tags
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
      action: "send_email",
      approved: context.approved,
      target: formatTarget(to),
      result: JSON.stringify({
        recipientDomains,
        subjectHash,
        bodyHash,
        bodySize,
        dryRun,
        outboxPath: result.outboxPath ?? null,
        messageId: result.messageId ?? null
      })
    });

    return {
      ...result,
      recipientDomains,
      subjectHash,
      bodyHash,
      bodySize
    };
  }
};
