import { NextResponse } from "next/server";
import { requireWorkerAuth } from "@/lib/hmac";
import { dequeueWorkerJob, getJob, updateJob } from "@/lib/store";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const auth = await requireWorkerAuth(req as any, rawBody);
  if (auth) {
    return auth;
  }
  let body: { jobId?: string } = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = {};
  }
  if (!body.jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }
  const job = await getJob(body.jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  job.status = "RUNNING";
  job.updatedAt = new Date().toISOString();
  await updateJob(job);
  await dequeueWorkerJob(job.id);
  return NextResponse.json({ ok: true, job });
}
