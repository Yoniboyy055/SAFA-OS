import { NextResponse } from "next/server";
import { Resend } from "resend";

import { createOtpCode, requireOwnerEmail, storeOtp } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = body.email || "";
    requireOwnerEmail(email);

    const resendKey = process.env.RESEND_API_KEY;
    const resendFrom = process.env.RESEND_FROM;
    if (!resendKey || !resendFrom) {
      return NextResponse.json(
        { error: "Resend configuration missing." },
        { status: 500 }
      );
    }

    const code = createOtpCode();
    await storeOtp(email, code);

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: resendFrom,
      to: email,
      subject: "SAFA Relay OTP",
      text: `Your SAFA Relay OTP is ${code}. It expires in 10 minutes.`
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Request failed." },
      { status: 400 }
    );
  }
}
