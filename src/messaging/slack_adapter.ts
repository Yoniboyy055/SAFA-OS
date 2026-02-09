import * as crypto from "node:crypto";
import type { AuditLogger } from "../core/audit";
import type { ResolvedConfig } from "../core/config";
import type {
  MessagingAdapter,
  IncomingMessage,
  OutgoingMessage,
  MessageDeliveryResult
} from "./types";

export class SlackAdapter implements MessagingAdapter {
  readonly platform = "slack" as const;
  private config: ResolvedConfig;
  private audit: AuditLogger;
  private actor: string;

  constructor(config: ResolvedConfig, audit: AuditLogger, actor: string = "slack_adapter") {
    this.config = config;
    this.audit = audit;
    this.actor = actor;
  }

  /**
   * Send a message to Slack
   */
  async sendMessage(message: OutgoingMessage): Promise<MessageDeliveryResult> {
    const slackConfig = this.config.messaging?.slack;
    
    if (!slackConfig?.enabled) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "slack.send.disabled",
        approved: false,
        target: message.to,
        result: "Slack messaging is disabled"
      });
      
      return {
        success: false,
        error: "Slack messaging is disabled",
        timestamp: new Date().toISOString()
      };
    }

    // Check if channel is allowlisted
    if (!this.isChannelAllowed(message.to)) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "slack.send.denied",
        approved: false,
        target: message.to,
        result: "Channel not in allowlist"
      });
      
      return {
        success: false,
        error: "Channel not in allowlist",
        timestamp: new Date().toISOString()
      };
    }

    // Dry run check
    if (slackConfig.dryRunDefault && !message.metadata?.skipDryRun) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "slack.send.dry_run",
        approved: true,
        target: message.to,
        result: `DRY RUN: Would send to ${message.to}: ${message.content}`
      });
      
      return {
        success: true,
        messageId: `dry-run-${Date.now()}`,
        timestamp: new Date().toISOString()
      };
    }

    try {
      // Send via Slack API
      const result = await this.sendToSlackAPI(message, slackConfig.botToken);
      
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "slack.send.success",
        approved: true,
        target: message.to,
        result: `Message sent: ${result.messageId}`
      });
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "slack.send.error",
        approved: false,
        target: message.to,
        result: `Error: ${errorMessage}`
      });
      
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Verify Slack webhook signature
   * https://api.slack.com/authentication/verifying-requests-from-slack
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Slack signature format: v0=<hash>
    const [version, hash] = signature.split("=");
    
    if (version !== "v0" || !hash) {
      return false;
    }

    const timestamp = new Date().toISOString(); // In real implementation, get from headers
    const baseString = `v0:${timestamp}:${payload}`;
    
    const expectedHash = crypto
      .createHmac("sha256", secret)
      .update(baseString)
      .digest("hex");
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(expectedHash)
      );
    } catch {
      return false;
    }
  }

  /**
   * Parse incoming Slack webhook payload
   */
  parseIncomingMessage(payload: Record<string, unknown>): IncomingMessage {
    // Slack event payload structure
    const event = payload.event as Record<string, unknown> || {};
    const id = String(event.client_msg_id || event.ts || "");
    const userId = String(event.user || "unknown");
    const channelId = String(event.channel || "");
    const text = String(event.text || "");
    const timestamp = String(event.ts || new Date().toISOString());

    return {
      platform: "slack",
      id,
      from: userId,
      to: channelId,
      content: text,
      timestamp,
      metadata: {
        teamId: payload.team_id,
        eventType: payload.type,
        raw: payload
      }
    };
  }

  /**
   * Check if a channel is in the allowlist
   */
  private isChannelAllowed(channelId: string): boolean {
    const allowlist = this.config.messaging?.slack?.channelAllowlist || [];
    return allowlist.includes(channelId) || allowlist.includes("*");
  }

  /**
   * Send message via Slack API
   */
  private async sendToSlackAPI(
    message: OutgoingMessage,
    botToken: string
  ): Promise<MessageDeliveryResult> {
    const url = "https://slack.com/api/chat.postMessage";
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        channel: message.to,
        text: message.content
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Slack API error ${response.status}: ${error}`);
    }

    const result = await response.json() as { ok: boolean; ts?: string; error?: string };
    
    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error || "Unknown error"}`);
    }
    
    return {
      success: true,
      messageId: result.ts || "",
      timestamp: new Date().toISOString()
    };
  }
}
