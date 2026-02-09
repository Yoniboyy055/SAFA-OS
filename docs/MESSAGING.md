# Messaging Integration Guide

## Overview

SAFA OS supports governed messaging across multiple platforms:
- **Discord** - Bot-based messaging with channel/guild allowlisting
- **Slack** - Workspace messaging with channel allowlisting  
- **WhatsApp** - Twilio-based WhatsApp Business API

All messaging platforms require:
- Explicit enablement in configuration
- Allowlist-based access control
- Governance approval for outbound messages
- Webhook signature verification for inbound messages
- Complete audit logging

## Architecture

```
┌─────────────────┐
│ Messaging       │
│ Platforms       │
│ (Discord/Slack/ │
│  WhatsApp)      │
└────────┬────────┘
         │ Webhooks
         ▼
┌─────────────────┐
│ SAFA Relay      │
│ (Vercel/Next.js)│
│ - Webhook       │
│   endpoints     │
│ - Signature     │
│   verification  │
└────────┬────────┘
         │ Job Queue
         ▼
┌─────────────────┐
│ Relay Poller    │
│ (Local Worker)  │
│ - Polls queue   │
│ - Creates jobs  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Message Router  │
│ - Routes to     │
│   adapters      │
│ - Applies       │
│   governance    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Platform        │
│ Adapters        │
│ - Send messages │
│ - Parse webhooks│
└─────────────────┘
```

## Configuration

### Discord

```json
{
  "messaging": {
    "discord": {
      "enabled": true,
      "botToken": "YOUR_BOT_TOKEN",
      "webhookUrl": "https://relay.example.com/api/webhooks/discord",
      "channelAllowlist": ["1234567890", "0987654321"],
      "guildAllowlist": ["1111111111"],
      "dryRunDefault": true
    }
  }
}
```

**Setup Steps:**
1. Create a Discord bot at https://discord.com/developers/applications
2. Enable "Message Content Intent" under Bot settings
3. Add bot to your server with appropriate permissions
4. Copy the bot token to configuration
5. Get channel IDs (right-click channel → Copy ID with Developer Mode enabled)
6. Get guild (server) ID (right-click server → Copy ID)

**Required Permissions:**
- Send Messages
- Read Message History
- View Channels

### Slack

```json
{
  "messaging": {
    "slack": {
      "enabled": true,
      "botToken": "xoxb-YOUR-TOKEN",
      "webhookUrl": "https://relay.example.com/api/webhooks/slack",
      "channelAllowlist": ["C01234567", "C98765432"],
      "workspaceAllowlist": ["T01234567"],
      "signingSecret": "YOUR_SIGNING_SECRET",
      "dryRunDefault": true
    }
  }
}
```

**Setup Steps:**
1. Create a Slack app at https://api.slack.com/apps
2. Add Bot Token Scopes: `chat:write`, `channels:history`, `channels:read`
3. Install app to workspace
4. Copy Bot User OAuth Token
5. Copy Signing Secret from Basic Information
6. Enable Event Subscriptions and set webhook URL
7. Subscribe to bot events: `message.channels`

### WhatsApp (Twilio)

```json
{
  "messaging": {
    "whatsapp": {
      "enabled": true,
      "provider": "twilio",
      "accountSid": "AC...",
      "authToken": "YOUR_AUTH_TOKEN",
      "fromNumberAllowlist": ["whatsapp:+14155238886"],
      "toNumberAllowlist": ["+1234567890", "+9876543210"],
      "webhookUrl": "https://relay.example.com/api/webhooks/whatsapp",
      "dryRunDefault": true
    }
  }
}
```

**Setup Steps:**
1. Create a Twilio account at https://www.twilio.com
2. Enable WhatsApp sandbox or get approved WhatsApp number
3. Copy Account SID and Auth Token
4. Configure webhook URL in Twilio console
5. Add approved phone numbers to allowlist (E.164 format: +1234567890)

## Usage

### Sending Messages

```typescript
import { MessageRouter } from "./messaging";
import { loadConfig } from "./core/config";
import { AuditLogger } from "./core/audit";

const config = loadConfig();
const audit = new AuditLogger(config.audit);
const router = new MessageRouter(config, audit);

// Send Discord message
const result = await router.sendMessage({
  platform: "discord",
  to: "1234567890", // Channel ID
  content: "Hello from SAFA!",
  metadata: { skipDryRun: false }
});

// Send Slack message
await router.sendMessage({
  platform: "slack",
  to: "C01234567", // Channel ID
  content: "Status update",
});

// Send WhatsApp message
await router.sendMessage({
  platform: "whatsapp",
  to: "+1234567890", // E.164 format
  content: "Alert: System update complete",
});
```

### Receiving Messages (Webhooks)

Webhook endpoints are deployed on SAFA Relay:

- **Discord**: `POST /api/webhooks/discord`
- **Slack**: `POST /api/webhooks/slack`
- **WhatsApp**: `POST /api/webhooks/whatsapp`

Each endpoint:
1. Verifies the webhook signature
2. Parses the incoming message
3. Queues it for processing by the relay poller
4. Returns appropriate response

### Direct Adapter Usage

```typescript
import { DiscordAdapter } from "./messaging";

const adapter = new DiscordAdapter(config, audit);

// Send message
const result = await adapter.sendMessage({
  platform: "discord",
  to: "channelId",
  content: "Direct message"
});

// Parse webhook
const incoming = adapter.parseIncomingMessage(webhookPayload);

// Verify signature
const isValid = adapter.verifyWebhookSignature(
  payloadString,
  signature,
  secret
);
```

## Security

### Allowlisting

All platforms enforce strict allowlisting:

**Discord:**
- `channelAllowlist` - only send to these channel IDs
- `guildAllowlist` - only process webhooks from these guilds

**Slack:**
- `channelAllowlist` - only send to these channel IDs  
- `workspaceAllowlist` - only process webhooks from these workspaces

**WhatsApp:**
- `fromNumberAllowlist` - numbers we can send from
- `toNumberAllowlist` - numbers we can send to

Use `"*"` to allow all (not recommended for production).

### Signature Verification

All webhook endpoints verify platform signatures:

- **Discord**: Ed25519 signature verification
- **Slack**: HMAC-SHA256 with v0 format
- **Twilio**: HMAC-SHA1 with URL + params

Failed verification results in 401 Unauthorized.

### Dry Run Mode

Set `dryRunDefault: true` to prevent actual message sending:
- Messages are logged to audit
- No API calls are made
- Dry run message ID is returned

Override per-message with `metadata.skipDryRun: true`.

### Audit Logging

All messaging operations are logged:

```json
{
  "timestamp": "2026-02-09T18:00:00Z",
  "actor": "discord_adapter",
  "action": "discord.send.success",
  "approved": true,
  "target": "1234567890",
  "result": "Message sent: msg_abc123"
}
```

Events logged:
- `<platform>.send.disabled` - platform not enabled
- `<platform>.send.denied` - not in allowlist
- `<platform>.send.dry_run` - dry run mode
- `<platform>.send.success` - message sent
- `<platform>.send.error` - send failed

## Integration with Triggers

Messaging platforms integrate with the proactivity system:

```json
{
  "proactivity": {
    "triggers": [
      {
        "id": "daily-standup",
        "type": "time",
        "schedule": "0 9 * * 1-5",
        "action": {
          "task": "Send daily standup reminder to Discord",
          "mode": "SCRIPT",
          "authority": "OWNER"
        },
        "requiredPermissions": ["messaging.discord"],
        "autoApprove": true
      }
    ]
  }
}
```

## Error Handling

All adapters return `MessageDeliveryResult`:

```typescript
interface MessageDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: string;
}
```

Check `success` before assuming delivery:

```typescript
const result = await router.sendMessage(message);

if (!result.success) {
  console.error("Failed to send:", result.error);
  // Handle error (retry, alert, etc.)
} else {
  console.log("Sent with ID:", result.messageId);
}
```

## Environment Variables

Required for webhook endpoints (deployed on Vercel):

```bash
# Discord (optional if not using webhooks)
DISCORD_PUBLIC_KEY=your_public_key

# Slack
SLACK_SIGNING_SECRET=your_signing_secret

# Twilio
TWILIO_AUTH_TOKEN=your_auth_token
```

## Testing

### Test Discord Adapter

```typescript
const adapter = new DiscordAdapter(config, audit);

// Test dry run
const result = await adapter.sendMessage({
  platform: "discord",
  to: "test-channel-id",
  content: "Test message",
  metadata: { skipDryRun: false }
});

assert.equal(result.success, true);
assert.ok(result.messageId?.startsWith("dry-run-"));
```

### Test Webhook Signature

```typescript
const payload = JSON.stringify({ test: "data" });
const secret = "test-secret";

const signature = crypto
  .createHmac("sha256", secret)
  .update(payload)
  .digest("hex");

const isValid = adapter.verifyWebhookSignature(
  payload,
  signature,
  secret
);

assert.equal(isValid, true);
```

## Troubleshooting

**Messages not sending:**
1. Check platform is enabled in config
2. Verify target is in allowlist
3. Check dry run mode
4. Review audit logs for errors
5. Verify API credentials

**Webhooks not working:**
1. Verify webhook URL is accessible
2. Check signature verification
3. Ensure environment variables are set
4. Check platform webhook settings
5. Review relay logs

**Rate Limiting:**
- Implement exponential backoff
- Monitor platform rate limits
- Queue messages during high volume
- Consider batching where supported

## Best Practices

1. **Always use allowlists** - Never use `"*"` in production
2. **Keep secrets secure** - Use environment variables, never commit
3. **Enable dry run by default** - Prevent accidental sends
4. **Monitor audit logs** - Track all messaging activity
5. **Test webhooks locally** - Use ngrok or similar for testing
6. **Rotate credentials regularly** - Update tokens/secrets periodically
7. **Handle failures gracefully** - Implement retry logic with backoff
8. **Rate limit yourself** - Don't rely solely on platform limits

## Future Enhancements

- [ ] Message templates
- [ ] Rich message formatting
- [ ] File/media attachments
- [ ] Thread/reply support
- [ ] Message reactions
- [ ] Batch sending
- [ ] Message scheduling
- [ ] Delivery receipts
- [ ] Read receipts
- [ ] User presence
