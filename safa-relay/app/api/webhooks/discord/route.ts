import { NextResponse } from "next/server";

/**
 * Discord Webhook Handler
 * Receives messages from Discord and queues them for processing
 */
export async function POST(req: Request) {
  try {
    const body = await req.text();
    const payload = JSON.parse(body);

    // Discord sends verification challenges
    if (payload.type === 1) {
      return NextResponse.json({ type: 1 });
    }

    // TODO: Verify Discord signature
    // const signature = req.headers.get("x-signature-ed25519");
    // const timestamp = req.headers.get("x-signature-timestamp");

    // Handle interaction (message)
    if (payload.type === 2 || payload.type === 4) {
      // Queue the message for processing
      // TODO: Store in KV or job queue
      
      console.log("Discord message received:", {
        id: payload.id,
        channelId: payload.channel_id,
        guildId: payload.guild_id
      });

      return NextResponse.json({ 
        type: 4,
        data: {
          content: "Message received and queued for processing."
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Discord webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({ 
    platform: "discord",
    status: "ok",
    timestamp: new Date().toISOString()
  });
}
