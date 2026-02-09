/**
 * Common types for messaging integrations
 */

export type MessagingPlatform = "discord" | "slack" | "whatsapp";

export interface IncomingMessage {
  platform: MessagingPlatform;
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface OutgoingMessage {
  platform: MessagingPlatform;
  to: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MessageDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: string;
}

export interface MessagingAdapter {
  platform: MessagingPlatform;
  
  /**
   * Send a message to the platform
   */
  sendMessage(message: OutgoingMessage): Promise<MessageDeliveryResult>;
  
  /**
   * Verify webhook signature (for incoming webhooks)
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  
  /**
   * Parse incoming webhook payload into standardized message
   */
  parseIncomingMessage(payload: Record<string, unknown>): IncomingMessage;
}

export interface MessagingConfig {
  enabled: boolean;
  dryRunDefault: boolean;
}

export interface DiscordConfig extends MessagingConfig {
  botToken: string;
  webhookUrl?: string;
  channelAllowlist: string[];
  guildAllowlist: string[];
}

export interface SlackConfig extends MessagingConfig {
  botToken: string;
  webhookUrl?: string;
  channelAllowlist: string[];
  workspaceAllowlist: string[];
  signingSecret?: string;
}

export interface WhatsAppConfig extends MessagingConfig {
  provider: "twilio";
  accountSid: string;
  authToken: string;
  fromNumberAllowlist: string[];
  toNumberAllowlist: string[];
  webhookUrl?: string;
}
