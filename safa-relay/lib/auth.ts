import * as crypto from "node:crypto";
import { cookies } from "next/headers";

import kv from "./kv";

const OTP_TTL_SECONDS = 60 * 10;
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const SESSION_COOKIE = "safa_session";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getOwnerEmail(): string {
  const raw = process.env.SAFA_OWNER_EMAIL || "";
  return normalizeEmail(raw);
}

export function requireOwnerEmail(email: string): void {
  const owner = getOwnerEmail();
  if (!owner || normalizeEmail(email) !== owner) {
    throw new Error("Email not allowed.");
  }
}

export function createOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function getSessionSigningKey(): string {
  const key = process.env.SAFA_SESSION_SIGNING_KEY;
  if (!key) {
    throw new Error("SAFA_SESSION_SIGNING_KEY missing.");
  }
  return key;
}

export function signSessionToken(token: string): string {
  const signature = crypto
    .createHmac("sha256", getSessionSigningKey())
    .update(token)
    .digest("base64url");
  return `${token}.${signature}`;
}

function verifySessionToken(value: string): string | null {
  const [token, signature] = value.split(".");
  if (!token || !signature) {
    return null;
  }
  const expected = crypto
    .createHmac("sha256", getSessionSigningKey())
    .update(token)
    .digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }
  return token;
}

export async function storeOtp(email: string, code: string): Promise<void> {
  const key = `otp:${normalizeEmail(email)}`;
  const payload = {
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString()
  };
  await kv.set(key, payload, { ex: OTP_TTL_SECONDS });
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const key = `otp:${normalizeEmail(email)}`;
  const record = (await kv.get(key)) as { codeHash?: string } | null;
  if (!record || !record.codeHash) {
    return false;
  }
  const ok = crypto.timingSafeEqual(
    Buffer.from(record.codeHash),
    Buffer.from(hashOtp(code))
  );
  if (ok) {
    await kv.del(key);
  }
  return ok;
}

export async function createSession(email: string): Promise<string> {
  const token = createSessionToken();
  const payload = {
    email: normalizeEmail(email),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  };
  await kv.set(`session:${token}`, payload, { ex: SESSION_TTL_SECONDS });
  return signSessionToken(token);
}

export async function getSessionEmail(): Promise<string | null> {
  const cookieStore = cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  if (!value) {
    return null;
  }
  const token = verifySessionToken(value);
  if (!token) {
    return null;
  }
  const record = (await kv.get(`session:${token}`)) as { email?: string } | null;
  if (!record || !record.email) {
    return null;
  }
  return record.email;
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS
  };
}
