import { NextResponse } from "next/server";

import {
  createSession,
  getSessionCookieName,
  getSessionCookieOptions,
  requireOwnerEmail,
  verifyOtp
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; code?: string };
    const email = body.email || "";
    const code = body.code || "";
    requireOwnerEmail(email);

    const ok = await verifyOtp(email, code);
    if (!ok) {
      return NextResponse.json({ error: "Invalid OTP." }, { status: 401 });
    }

    const sessionValue = await createSession(email);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      getSessionCookieName(),
      sessionValue,
      getSessionCookieOptions()
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Verification failed." },
      { status: 400 }
    );
  }
}
