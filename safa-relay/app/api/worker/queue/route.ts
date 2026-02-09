import { NextResponse } from "next/server";
import { requireWorkerAuth } from "@/lib/hmac";
import { listWorkerQueue } from "@/lib/store";

export async function GET(req: Request) {
  const rawBody = "";
  const auth = await requireWorkerAuth(req as any, rawBody);
  if (auth) {
    return auth;
  }
  const jobs = await listWorkerQueue(50);
  return NextResponse.json({ jobs });
}
