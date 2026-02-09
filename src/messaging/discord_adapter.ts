import * as crypto from "node:crypto";
import type { AuditLogger } from "../core/audit";
import type { ResolvedConfig } from "../core/config";
import type {
  MessagingAdapter,
  IncomingMessage,
  OutgoingMessage,
  MessageDeliveryResult
} from "./types";

export class DiscordAdapter implements MessagingAdapter {
  readonly platform = "discord" as const;
  private config: ResolvedConfig;
  private audit: AuditLogger;
  private actor: string;

  constructor(config: ResolvedConfig, audit: AuditLogger, actor: string = "discord_adapter") {
    this.config = config;
    this.audit = audit;
    this.actor = actor;
  }

  /**
   * Send a message to Discord
   */
  async sendMessage(message: OutgoingMessage): Promise<MessageDeliveryResult> {
    const discordConfig = this.config.messaging?.discord;
    
    if (!discordConfig?.enabled) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "discord.send.disabled",
        approved: false,
        target: message.to,
        result: "Discord messaging is disabled"
      });
      
      return {
        success: false,
        error: "Discord messaging is disabled",
        timestamp: new Date().toISOString()
      };
    }

    // Check if channel is allowlisted
    if (!this.isChannelAllowed(message.to)) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "discord.send.denied",
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
    if (discordConfig.dryRunDefault && !message.metadata?.skipDryRun) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "discord.send.dry_run",
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
      // Send via Discord API
      const result = await this.sendToDiscordAPI(message, discordConfig.botToken);
      
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "discord.send.success",
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
        action: "discord.send.error",
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
   * Verify Discord webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Parse incoming Discord webhook payload
   */
  parseIncomingMessage(payload: Record<string, unknown>): IncomingMessage {
    // Discord webhook payload structure
    const id = String(payload.id || "");
    const author = payload.author as Record<string, unknown> || {};
    const content = String(payload.content || "");
    const channelId = String(payload.channel_id || "");
    const timestamp = String(payload.timestamp || new Date().toISOString());

    return {
      platform: "discord",
      id,
      from: String(author.id || author.username || "unknown"),
      to: channelId,
      content,
      timestamp,
      metadata: {
        authorName: author.username,
        guildId: payload.guild_id,
        raw: payload
      }
    };
  }

  /**
   * Check if a channel is in the allowlist
   */
  private isChannelAllowed(channelId: string): boolean {
    const allowlist = this.config.messaging?.discord?.channelAllowlist || [];
    return allowlist.includes(channelId) || allowlist.includes("*");
  }

  /**
   * Send message via Discord API
   */
  private async sendToDiscordAPI(
    message: OutgoingMessage,
    botToken: string
  ): Promise<MessageDeliveryResult> {
    const url = `https://discord.com/api/v10/channels/${message.to}/messages`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: message.content
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error ${response.status}: ${error}`);
    }

    const result = await response.json() as { id: string };
    
    return {
      success: true,
      messageId: result.id,
      timestamp: new Date().toISOString()
    };
  }
}
