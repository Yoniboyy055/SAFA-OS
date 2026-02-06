export interface EmailMessage {
  from?: string;
  to: string[];
  subject: string;
  body: string;
  templateId?: string;
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface EmailSendResult {
  mode: "DRY_RUN" | "SENT";
  messageId: string;
  outboxPath?: string;
  accepted?: string[];
  rejected?: string[];
}
