import type { AuditLogger } from "../core/audit";
import type { ResolvedConfig } from "../core/config";
import type {
  MessagingPlatform,
  OutgoingMessage,
  MessageDeliveryResult
} from "./types";
import { DiscordAdapter } from "./discord_adapter";
import { SlackAdapter } from "./slack_adapter";
import { WhatsAppAdapter } from "./whatsapp_adapter";

export class MessageRouter {
  private discordAdapter: DiscordAdapter;
  private slackAdapter: SlackAdapter;
  private whatsappAdapter: WhatsAppAdapter;
  private config: ResolvedConfig;
  private audit: AuditLogger;
  private actor: string;

  constructor(config: ResolvedConfig, audit: AuditLogger, actor: string = "message_router") {
    this.config = config;
    this.audit = audit;
    this.actor = actor;
    
    this.discordAdapter = new DiscordAdapter(config, audit);
    this.slackAdapter = new SlackAdapter(config, audit);
    this.whatsappAdapter = new WhatsAppAdapter(config, audit);
  }

  /**
   * Route a message to the appropriate platform adapter
   */
  async sendMessage(message: OutgoingMessage): Promise<MessageDeliveryResult> {
    this.audit.log({
      timestamp: new Date().toISOString(),
      actor: this.actor,
      action: "message_router.send",
      approved: true,
      target: `${message.platform}:${message.to}`,
      result: "Routing message"
    });

    switch (message.platform) {
      case "discord":
        return this.discordAdapter.sendMessage(message);
      case "slack":
        return this.slackAdapter.sendMessage(message);
      case "whatsapp":
        return this.whatsappAdapter.sendMessage(message);
      default:
        const error = `Unknown platform: ${message.platform}`;
        this.audit.log({
          timestamp: new Date().toISOString(),
          actor: this.actor,
          action: "message_router.error",
          approved: false,
          target: message.platform,
          result: error
        });
        return {
          success: false,
          error,
          timestamp: new Date().toISOString()
        };
    }
  }

  /**
   * Get the adapter for a specific platform
   */
  getAdapter(platform: MessagingPlatform) {
    switch (platform) {
      case "discord":
        return this.discordAdapter;
      case "slack":
        return this.slackAdapter;
      case "whatsapp":
        return this.whatsappAdapter;
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }
}
