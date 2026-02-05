export interface EmailMessage {
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  dryRun?: boolean;
  tags?: string[];
}

export interface EmailSendResult {
  mode: "DRY_RUN" | "SENT";
  messageId: string;
  outboxPath?: string;
  accepted?: string[];
  rejected?: string[];
}
