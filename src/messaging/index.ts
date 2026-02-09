/**
 * Messaging module - provides adapters for Discord, Slack, and WhatsApp
 */

export * from "./types";
export { DiscordAdapter } from "./discord_adapter";
export { SlackAdapter } from "./slack_adapter";
export { WhatsAppAdapter } from "./whatsapp_adapter";
export { MessageRouter } from "./message_router";
