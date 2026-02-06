import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import type { EmailMessage, EmailSendResult } from "../../core/email/types";
import { sendEmail } from "../../core/email/client";

interface SendEmailInput {
  to: string | string[];
  subject: string;
  body: string;
  dryRun?: boolean;
  templateId?: string;
  metadata?: Record<string, unknown>;
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
    required: ["to", "subject", "body"],
    properties: {
      to: { type: "string", description: "Recipient email or list." },
      subject: { type: "string", description: "Email subject." },
      body: { type: "string", description: "Email body." },
      dryRun: { type: "boolean", description: "Dry run only." },
      templateId: { type: "string", description: "Template identifier." },
      metadata: { type: "object", description: "Template metadata." }
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
    if (to.length === 0) {
      throw new Error("At least one recipient is required.");
    }
    if (!input.subject || typeof input.subject !== "string") {
      throw new Error("Subject is required.");
    }
    if (!input.body || typeof input.body !== "string") {
      throw new Error("Body is required.");
    }

    const dryRun =
      typeof input.dryRun === "boolean"
        ? input.dryRun
        : context.config.email.dryRunDefault;

    if (
      context.config.permissions.emailSubjectAllowlist.length === 0 ||
      !context.config.permissions.emailSubjectAllowlist.includes(input.subject)
    ) {
      throw new Error("Email subject not allowlisted.");
    }

    if (
      input.templateId &&
      (context.config.permissions.emailTemplateAllowlist.length === 0 ||
        !context.config.permissions.emailTemplateAllowlist.includes(
          input.templateId
        ))
    ) {
      throw new Error("Email template not allowlisted.");
    }

    const subjectHash = hashValue(input.subject);
    const bodyHash = hashValue(input.body);
    const bodySize = input.body.length;
    const recipientDomains = getRecipientDomains(to);

    const result = await sendEmail(
      {
        to,
        subject: input.subject,
        body: input.body,
        templateId: input.templateId,
        metadata: input.metadata,
        dryRun
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
