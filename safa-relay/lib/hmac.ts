import * as crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const MAX_SKEW_MS = 5 * 60 * 1000;

function getWorkerKey(): string {
  const key = process.env.SAFA_WORKER_HMAC_KEY;
  if (!key) {
    throw new Error("SAFA_WORKER_HMAC_KEY missing.");
  }
  return key;
}

function hashBody(body: string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getWorkerKey()).update(payload).digest("base64url");
}

export async function requireWorkerAuth(req: NextRequest, rawBody: string): Promise<NextResponse | null> {
  const timestamp = req.headers.get("x-safa-timestamp") || "";
  const signature = req.headers.get("x-safa-signature") || "";
  if (!timestamp || !signature) {
    return NextResponse.json({ error: "Missing HMAC headers." }, { status: 401 });
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return NextResponse.json({ error: "HMAC timestamp expired." }, { status: 401 });
  }
  const payload = `${timestamp}.${req.method}.${req.nextUrl.pathname}.${hashBody(rawBody)}`;
  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return NextResponse.json({ error: "Invalid HMAC signature." }, { status: 401 });
  }
  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return NextResponse.json({ error: "Invalid HMAC signature." }, { status: 401 });
  }
  return null;
}
