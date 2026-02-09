import { NextResponse } from "next/server";
import * as crypto from "node:crypto";

/**
 * Slack Webhook Handler
 * Receives events from Slack and queues them for processing
 */
export async function POST(req: Request) {
  try {
    const body = await req.text();
    const payload = JSON.parse(body);

    // Slack sends URL verification challenges
    if (payload.type === "url_verification") {
      return NextResponse.json({ challenge: payload.challenge });
    }

    // Verify Slack signature
    const signature = req.headers.get("x-slack-signature");
    const timestamp = req.headers.get("x-slack-request-timestamp");
    const signingSecret = process.env.SLACK_SIGNING_SECRET;

    if (signature && timestamp && signingSecret) {
      const isValid = verifySlackSignature(
        body,
        signature,
        timestamp,
        signingSecret
      );

      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    // Handle event callback
    if (payload.type === "event_callback") {
      const event = payload.event;

      // Ignore bot messages to prevent loops
      if (event.bot_id) {
        return NextResponse.json({ success: true });
      }

      // Queue the message for processing
      // TODO: Store in KV or job queue
      
      console.log("Slack event received:", {
        type: event.type,
        user: event.user,
        channel: event.channel,
        text: event.text?.substring(0, 50)
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Slack webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

/**
 * Verify Slack request signature
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlackSignature(
  body: string,
  signature: string,
  timestamp: string,
  signingSecret: string
): boolean {
  // Check timestamp is recent (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  if (Math.abs(now - requestTime) > 60 * 5) {
    return false;
  }

  // Build base string
  const [version, hash] = signature.split("=");
  if (version !== "v0" || !hash) {
    return false;
  }

  const baseString = `v0:${timestamp}:${body}`;
  const expectedHash = crypto
    .createHmac("sha256", signingSecret)
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
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    platform: "slack",
    status: "ok",
    timestamp: new Date().toISOString()
  });
}
