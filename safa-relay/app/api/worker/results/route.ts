import { NextResponse } from "next/server";
import { requireWorkerAuth } from "@/lib/hmac";
import { getJob, saveResult, updateJob } from "@/lib/store";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const auth = await requireWorkerAuth(req as any, rawBody);
  if (auth) {
    return auth;
  }
  let body: { jobId?: string; logs?: string; output?: any; status?: string } = {};
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
  const finalStatus = body.status === "FAILED" ? "FAILED" : "DONE";
  job.status = finalStatus;
  job.updatedAt = new Date().toISOString();
  await updateJob(job);
  await saveResult({
    jobId: job.id,
    logs: body.logs,
    output: body.output,
    createdAt: new Date().toISOString()
  });
  return NextResponse.json({ ok: true });
}
