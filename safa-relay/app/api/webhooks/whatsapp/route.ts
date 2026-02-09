import { NextResponse } from "next/server";
import * as crypto from "node:crypto";

/**
 * WhatsApp (Twilio) Webhook Handler
 * Receives messages from Twilio WhatsApp and queues them for processing
 */
export async function POST(req: Request) {
  try {
    const body = await req.text();
    
    // Parse URL-encoded form data (Twilio sends form data, not JSON)
    const formData = new URLSearchParams(body);
    const payload: Record<string, string> = {};
    formData.forEach((value, key) => {
      payload[key] = value;
    });

    // Verify Twilio signature
    const signature = req.headers.get("x-twilio-signature");
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const url = req.url;

    if (signature && authToken && url) {
      const isValid = verifyTwilioSignature(
        url,
        payload,
        signature,
        authToken
      );

      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    // Extract message details
    const messageSid = payload.MessageSid || payload.SmsSid;
    const from = payload.From;
    const to = payload.To;
    const body_text = payload.Body;

    // Queue the message for processing
    // TODO: Store in KV or job queue
    
    console.log("WhatsApp message received:", {
      messageSid,
      from,
      to,
      preview: body_text?.substring(0, 50)
    });

    // Respond with TwiML (optional)
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Message received and queued for processing.</Message>
</Response>`,
      {
        headers: {
          "Content-Type": "text/xml"
        }
      }
    );
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

/**
 * Verify Twilio request signature
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  // Sort parameters alphabetically and concatenate
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  // Compute HMAC-SHA1
  const expectedSignature = crypto
    .createHmac("sha1", authToken)
    .update(data)
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
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    platform: "whatsapp",
    provider: "twilio",
    status: "ok",
    timestamp: new Date().toISOString()
  });
}
