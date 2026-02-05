const nodemailer = require("nodemailer");

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import type { EmailMessage, EmailSendResult } from "./types";

export interface EmailClientContext {
  actor: string;
  approved: boolean;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  transportOverride?: {
    sendMail: (options: Record<string, unknown>) => Promise<{
      messageId?: string;
      accepted?: string[];
      rejected?: string[];
    }>;
  };
}

interface RecipientValidation {
  normalized: string[];
  domains: string[];
}

const OUTBOX_DIR = path.join("data", "outbox");
const PREVIEW_BODY_LIMIT = 10_000;

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function normalizeRecipients(
  recipients?: string[] | string
): string[] {
  if (!recipients) {
    return [];
  }
  if (Array.isArray(recipients)) {
    return recipients
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof recipients === "string") {
    return recipients
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function getDomain(address: string): string {
  const parts = address.split("@");
  return parts.length > 1 ? parts[1].toLowerCase() : "";
}

function matchesPattern(address: string, pattern: string): boolean {
  const normalized = normalizeAddress(address);
  const normalizedPattern = normalizeAddress(pattern);
  if (!normalizedPattern.includes("*")) {
    return normalized === normalizedPattern;
  }
  if (!normalizedPattern.startsWith("*@")) {
    return false;
  }
  const domainPattern = normalizedPattern.slice(2);
  const domain = getDomain(normalized);
  if (domainPattern.startsWith("*.")) {
    const suffix = domainPattern.slice(1);
    return domain.endsWith(suffix);
  }
  return domain === domainPattern;
}

function ensureRecipientsAllowlisted(
  recipients: string[],
  allowlist: string[],
  denylist: string[]
): RecipientValidation {
  if (recipients.length === 0) {
    throw new Error("At least one recipient is required.");
  }
  if (!allowlist || allowlist.length === 0) {
    throw new Error("Recipient allowlist is empty.");
  }
  const normalized: string[] = [];
  const domains = new Set<string>();

  for (const recipient of recipients) {
    const trimmed = recipient.trim();
    if (!trimmed.includes("@")) {
      throw new Error(`Invalid recipient address: ${recipient}`);
    }
    if (denylist.some((pattern) => matchesPattern(trimmed, pattern))) {
      throw new Error(`Recipient denied: ${recipient}`);
    }
    const allowed = allowlist.some((pattern) => matchesPattern(trimmed, pattern));
    if (!allowed) {
      throw new Error(`Recipient not allowlisted: ${recipient}`);
    }
    normalized.push(trimmed);
    const domain = getDomain(trimmed);
    if (domain) {
      domains.add(domain);
    }
  }

  return {
    normalized,
    domains: Array.from(domains.values())
  };
}

function parseBoolean(value?: string): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const lowered = value.toLowerCase();
  if (lowered === "true") {
    return true;
  }
  if (lowered === "false") {
    return false;
  }
  return undefined;
}

function isHostAllowlisted(
  host: string,
  port: number,
  allowlistDomains: string[],
  allowlistUrls: string[]
): boolean {
  const normalizedHost = host.toLowerCase();
  const allowlistedDomain = allowlistDomains.some((domain) => {
    const normalizedDomain = domain.toLowerCase();
    return (
      normalizedHost === normalizedDomain ||
      normalizedHost.endsWith(`.${normalizedDomain}`)
    );
  });
  if (allowlistedDomain) {
    return true;
  }
  const pseudoUrl = `smtp://${normalizedHost}:${port}`;
  return allowlistUrls.some(
    (entry) => entry.toLowerCase() === pseudoUrl
  );
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function buildEml(message: EmailMessage): string {
  const lines: string[] = [];
  if (message.from) {
    lines.push(`From: ${message.from}`);
  }
  lines.push(`To: ${message.to.join(", ")}`);
  if (message.cc && message.cc.length > 0) {
    lines.push(`Cc: ${message.cc.join(", ")}`);
  }
  if (message.bcc && message.bcc.length > 0) {
    lines.push(`Bcc: ${message.bcc.join(", ")}`);
  }
  lines.push(`Subject: ${message.subject}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push("");
  if (message.text) {
    lines.push(message.text.slice(0, PREVIEW_BODY_LIMIT));
  } else if (message.html) {
    lines.push(message.html.slice(0, PREVIEW_BODY_LIMIT));
  }
  return lines.join("\n");
}

function hashContent(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getSmtpConfig(config: ResolvedConfig): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
} {
  const host = process.env.SMTP_HOST ?? config.email.smtp.host;
  const envPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const port = Number.isFinite(envPort) && envPort ? envPort : config.email.smtp.port;
  const envSecure = parseBoolean(process.env.SMTP_SECURE);
  const secure = envSecure ?? config.email.smtp.secure;
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  return { host, port, secure, user, pass };
}

function resolveFrom(config: ResolvedConfig): string {
  return config.email.from || process.env.EMAIL_FROM || "";
}

export async function sendEmail(
  message: EmailMessage,
  context: EmailClientContext
): Promise<EmailSendResult> {
  const to = normalizeRecipients(message.to);
  const cc = normalizeRecipients(message.cc);
  const bcc = normalizeRecipients(message.bcc);
  const allRecipients = [...to, ...cc, ...bcc];
  const allowlist = context.config.permissions.emailRecipientAllowlist;
  const denylist = context.config.permissions.emailRecipientDenylist;
  const validation = ensureRecipientsAllowlisted(allRecipients, allowlist, denylist);

  const dryRun =
    typeof message.dryRun === "boolean"
      ? message.dryRun
      : context.config.email.dryRunDefault;

  const governorDecision = context.governor.evaluate(
    {
      type: "send_email",
      category: "outbound_message",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: dryRun
    },
    context.config,
    { actor: context.actor, approved: context.approved }
  );
  if (!governorDecision.allowed) {
    throw new Error(governorDecision.reason);
  }

  const smtpConfig = getSmtpConfig(context.config);
  if (!dryRun && !context.config.email.enabled) {
    throw new Error("Email is disabled by configuration.");
  }

  if (!dryRun && !context.config.network.enabled) {
    throw new Error("Network disabled");
  }

  if (
    !dryRun &&
    !isHostAllowlisted(
      smtpConfig.host,
      smtpConfig.port,
      context.config.network.allowlistDomains,
      context.config.network.allowlistUrls
    )
  ) {
    throw new Error("SMTP host is not allowlisted.");
  }

  const from = message.from ?? resolveFrom(context.config);
  if (!from) {
    throw new Error("Email 'from' address is required.");
  }

  if (dryRun) {
    const timestamp = formatTimestamp(new Date());
    const content = buildEml({
      ...message,
      to,
      cc,
      bcc,
      from
    });
    const hash = hashContent(`${timestamp}:${content}`);
    const fileName = `${timestamp}_${hash.slice(0, 12)}.eml`;
    const outboxDir = path.resolve(context.config.rootDir, OUTBOX_DIR);
    const outboxPath = path.join(outboxDir, fileName);
    fs.mkdirSync(outboxDir, { recursive: true });
    fs.writeFileSync(outboxPath, content, { encoding: "utf8" });
    return {
      mode: "DRY_RUN",
      outboxPath,
      messageId: `dryrun-${hash.slice(0, 12)}`,
      accepted: validation.normalized,
      rejected: []
    };
  }

  if (!smtpConfig.user || !smtpConfig.pass) {
    throw new Error("SMTP credentials are required.");
  }

  const transport =
    context.transportOverride ??
    nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass
      }
    });

  const sendResult = await transport.sendMail({
    from,
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    subject: message.subject,
    text: message.text,
    html: message.html
  });

  return {
    mode: "SENT",
    messageId: sendResult.messageId ?? "unknown",
    accepted: sendResult.accepted ?? [],
    rejected: sendResult.rejected ?? []
  };
}
