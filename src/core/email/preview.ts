import * as crypto from "node:crypto";

import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import type { EmailMessage } from "./types";
import { sendEmail } from "./client";

export interface EmailPreviewContext {
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

export interface EmailPreviewResult {
  previewHash: string;
  outboxPath?: string;
  messageId?: string;
  costEstimateUsd: number;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function previewSend(
  message: EmailMessage,
  context: EmailPreviewContext
): Promise<EmailPreviewResult> {
  const result = await sendEmail(
    {
      ...message,
      dryRun: true
    },
    context
  );

  const previewHash = hashValue(
    JSON.stringify({
      to: message.to,
      subject: message.subject,
      body: message.body
    })
  );
  const costEstimateUsd = context.costEstimateUsd ?? 0;

  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "preview.created",
    approved: context.approved,
    target: "email",
    result: JSON.stringify({ previewHash, costEstimateUsd })
  });

  return {
    previewHash,
    outboxPath: result.outboxPath,
    messageId: result.messageId,
    costEstimateUsd
  };
}
