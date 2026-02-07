import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import { getPhase7bLockMessage } from "../phase7b/locked";
import type { EmailMessage, EmailSendResult } from "./types";
import { readFreezeState } from "../freeze";

export interface EmailClientContext {
  actor: string;
  approved: boolean;
  authority: import("../authority").AuthorityLevel;
  commandMode: import("../../cli/command_mode").CommandMode;
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

function extractEmail(address: string): string {
  const match = address.match(/<([^>]+)>/);
  return match ? match[1] : address;
}

function normalizeAddress(address: string): string {
  return extractEmail(address).trim().toLowerCase();
}

function normalizeRecipients(recipients: string[]): string[] {
  return recipients
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getDomain(address: string): string {
  const parts = normalizeAddress(address).split("@");
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
  domainAllowlist: string[]
): RecipientValidation {
  if (recipients.length === 0) {
    throw new Error("At least one recipient is required.");
  }
  const hasAllowlist = allowlist && allowlist.length > 0;
  const hasDomainAllowlist = domainAllowlist && domainAllowlist.length > 0;
  if (!hasAllowlist && !hasDomainAllowlist) {
    throw new Error("Recipient allowlist is empty.");
  }
  const normalized: string[] = [];
  const domains = new Set<string>();

  for (const recipient of recipients) {
    const trimmed = recipient.trim();
    const normalizedAddress = normalizeAddress(trimmed);
    if (!normalizedAddress.includes("@")) {
      throw new Error(`Invalid recipient address: ${recipient}`);
    }
    const allowed =
      (hasAllowlist &&
        allowlist.some((pattern) => matchesPattern(normalizedAddress, pattern))) ||
      (hasDomainAllowlist &&
        domainAllowlist.some((domain) => {
          const normalizedDomain = domain.toLowerCase();
          const recipientDomain = getDomain(normalizedAddress);
          return (
            recipientDomain === normalizedDomain ||
            recipientDomain.endsWith(`.${normalizedDomain}`)
          );
        }));
    if (!allowed) {
      throw new Error(`Recipient not allowlisted: ${recipient}`);
    }
    normalized.push(normalizedAddress);
    const domain = getDomain(normalizedAddress);
    if (domain) {
      domains.add(domain);
    }
  }

  return {
    normalized,
    domains: Array.from(domains.values())
  };
}

function ensureFromAllowlisted(from: string, allowlist: string[]): void {
  if (!allowlist || allowlist.length === 0) {
    throw new Error("From allowlist is empty.");
  }
  const allowed = allowlist.some((pattern) => matchesPattern(from, pattern));
  if (!allowed) {
    throw new Error("From address not allowlisted.");
  }
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
  lines.push(`Subject: ${message.subject}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push("");
  lines.push(message.body.slice(0, PREVIEW_BODY_LIMIT));
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
  const deny = (reason: string): never => {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.denied",
      approved: context.approved,
      target: "email",
      result: reason
    });
    throw new Error(reason);
  };

  const to = normalizeRecipients(message.to);
  let validation: RecipientValidation = { normalized: [], domains: [] };
  try {
    validation = ensureRecipientsAllowlisted(
      to,
      context.config.email.toAllowlist,
      context.config.email.domainAllowlist
    );
  } catch (error) {
    deny(error instanceof Error ? error.message : String(error));
  }

  const dryRun =
    typeof message.dryRun === "boolean"
      ? message.dryRun
      : context.config.email.dryRunDefault;

  if (
    context.config.email.provider !== "smtp" &&
    context.config.email.provider !== "gmail"
  ) {
    deny("Email provider is not supported.");
  }

  const freezeEnabled = readFreezeState(context.config.rootDir).enabled;
  const governorDecision = context.governor.evaluate(
    {
      type: "send_email",
      category: "outbound_message",
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
      freezeEnabled,
      defenseText: message.body,
      maturityLevel: 5,
      freshOwnerInput: true,
      costEstimateUsd: 0
    }
  );
  if (!governorDecision.allowed) {
    deny(governorDecision.reason);
  }

  const smtpConfig = getSmtpConfig(context.config);
  if (!dryRun && !context.config.email.enabled) {
    deny("Email is disabled by configuration.");
  }

  if (!dryRun && !context.config.network.enabled) {
    deny("Network disabled");
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
    deny("SMTP host is not allowlisted.");
  }

  const from = message.from ?? resolveFrom(context.config);
  if (!from) {
    deny("Email 'from' address is required.");
  }
  try {
    ensureFromAllowlisted(from, context.config.email.fromAllowlist);
  } catch (error) {
    deny(error instanceof Error ? error.message : String(error));
  }

  if (dryRun) {
    const timestamp = formatTimestamp(new Date());
    const content = buildEml({
      ...message,
      to,
      from
    });
    const hash = hashContent(`${timestamp}:${content}`);
    const fileName = `${timestamp}_${hash.slice(0, 12)}.eml`;
    const outboxDir = path.resolve(context.config.rootDir, OUTBOX_DIR);
    const outboxPath = path.join(outboxDir, fileName);
    fs.mkdirSync(outboxDir, { recursive: true });
    fs.writeFileSync(outboxPath, content, { encoding: "utf8" });
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "request.preview",
      approved: context.approved,
      target: "email",
      result: JSON.stringify({
        messageId: `dryrun-${hash.slice(0, 12)}`,
        outboxPath
      })
    });
    return {
      mode: "DRY_RUN",
      outboxPath,
      messageId: `dryrun-${hash.slice(0, 12)}`,
      accepted: validation.normalized,
      rejected: []
    };
  }

  const reason = getPhase7bLockMessage();
  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "request.denied",
    approved: context.approved,
    target: "email",
    result: reason
  });
  throw new Error(reason);
}
