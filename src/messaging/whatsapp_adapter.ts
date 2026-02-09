import * as crypto from "node:crypto";
import type { AuditLogger } from "../core/audit";
import type { ResolvedConfig } from "../core/config";
import type {
  MessagingAdapter,
  IncomingMessage,
  OutgoingMessage,
  MessageDeliveryResult
} from "./types";

export class WhatsAppAdapter implements MessagingAdapter {
  readonly platform = "whatsapp" as const;
  private config: ResolvedConfig;
  private audit: AuditLogger;
  private actor: string;

  constructor(config: ResolvedConfig, audit: AuditLogger, actor: string = "whatsapp_adapter") {
    this.config = config;
    this.audit = audit;
    this.actor = actor;
  }

  /**
   * Send a message via WhatsApp (Twilio)
   */
  async sendMessage(message: OutgoingMessage): Promise<MessageDeliveryResult> {
    const whatsappConfig = this.config.messaging?.whatsapp;
    
    if (!whatsappConfig?.enabled) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "whatsapp.send.disabled",
        approved: false,
        target: message.to,
        result: "WhatsApp messaging is disabled"
      });
      
      return {
        success: false,
        error: "WhatsApp messaging is disabled",
        timestamp: new Date().toISOString()
      };
    }

    // Validate and check if number is allowlisted
    const normalizedTo = this.normalizePhoneNumber(message.to);
    if (!this.isNumberAllowed(normalizedTo, "to")) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "whatsapp.send.denied",
        approved: false,
        target: normalizedTo,
        result: "Phone number not in toNumberAllowlist"
      });
      
      return {
        success: false,
        error: "Phone number not in allowlist",
        timestamp: new Date().toISOString()
      };
    }

    // Dry run check
    if (whatsappConfig.dryRunDefault && !message.metadata?.skipDryRun) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "whatsapp.send.dry_run",
        approved: true,
        target: normalizedTo,
        result: `DRY RUN: Would send to ${normalizedTo}: ${message.content}`
      });
      
      return {
        success: true,
        messageId: `dry-run-${Date.now()}`,
        timestamp: new Date().toISOString()
      };
    }

    try {
      // Get from number
      const fromNumber = this.getFromNumber();
      
      // Send via Twilio API
      const result = await this.sendViaTwilioAPI(
        fromNumber,
        normalizedTo,
        message.content,
        whatsappConfig
      );
      
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "whatsapp.send.success",
        approved: true,
        target: normalizedTo,
        result: `Message sent: ${result.messageId}`
      });
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "whatsapp.send.error",
        approved: false,
        target: normalizedTo,
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
   * Verify Twilio webhook signature
   * https://www.twilio.com/docs/usage/webhooks/webhooks-security
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Twilio uses HMAC-SHA1, not SHA256
    const expectedSignature = crypto
      .createHmac("sha1", secret)
      .update(payload)
      .digest("base64");
    
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
   * Parse incoming Twilio WhatsApp webhook payload
   */
  parseIncomingMessage(payload: Record<string, unknown>): IncomingMessage {
    // Twilio webhook payload structure
    const messageSid = String(payload.MessageSid || payload.SmsSid || "");
    const from = String(payload.From || "");
    const to = String(payload.To || "");
    const body = String(payload.Body || "");
    const timestamp = new Date().toISOString();

    return {
      platform: "whatsapp",
      id: messageSid,
      from: this.normalizePhoneNumber(from),
      to: this.normalizePhoneNumber(to),
      content: body,
      timestamp,
      metadata: {
        accountSid: payload.AccountSid,
        numMedia: payload.NumMedia,
        raw: payload
      }
    };
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(number: string): string {
    // Remove whatsapp: prefix if present
    let normalized = number.replace(/^whatsapp:/, "");
    
    // Ensure it starts with +
    if (!normalized.startsWith("+")) {
      normalized = "+" + normalized;
    }
    
    return normalized;
  }

  /**
   * Check if a phone number is in the allowlist
   */
  private isNumberAllowed(number: string, direction: "from" | "to"): boolean {
    const config = this.config.messaging?.whatsapp;
    if (!config) return false;
    
    const allowlist = direction === "from" 
      ? config.fromNumberAllowlist 
      : config.toNumberAllowlist;
    
    return allowlist.includes(number) || allowlist.includes("*");
  }

  /**
   * Get the from number for sending messages
   */
  private getFromNumber(): string {
    const config = this.config.messaging?.whatsapp;
    if (!config || config.fromNumberAllowlist.length === 0) {
      throw new Error("No from numbers configured");
    }
    
    // Return the first number in the allowlist
    return config.fromNumberAllowlist[0];
  }

  /**
   * Send message via Twilio API
   */
  private async sendViaTwilioAPI(
    from: string,
    to: string,
    body: string,
    config: { accountSid: string; authToken: string }
  ): Promise<MessageDeliveryResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
    
    // Ensure numbers have whatsapp: prefix
    const fromWhatsApp = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
    const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    
    const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
    
    const formData = new URLSearchParams();
    formData.append("From", fromWhatsApp);
    formData.append("To", toWhatsApp);
    formData.append("Body", body);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio API error ${response.status}: ${error}`);
    }

    const result = await response.json() as { sid: string };
    
    return {
      success: true,
      messageId: result.sid,
      timestamp: new Date().toISOString()
    };
  }
}
