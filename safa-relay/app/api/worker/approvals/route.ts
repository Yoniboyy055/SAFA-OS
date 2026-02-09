import { NextResponse } from "next/server";
import { requireWorkerAuth } from "@/lib/hmac";
import {
  createApproval,
  createJob,
  getJob,
  updateJob,
  type ApprovalRecord,
  type JobRecord
} from "@/lib/store";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const auth = await requireWorkerAuth(req as any, rawBody);
  if (auth) {
    return auth;
  }
  let body: { jobId?: string; approvalPayload?: any } = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = {};
  }
  if (!body.jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }
  let job = await getJob(body.jobId);
  const now = new Date().toISOString();
  const approvalId = createId("apr");

  if (!job) {
    const placeholder: JobRecord = {
      id: body.jobId,
      status: "PENDING",
      email: "unknown",
      createdAt: now,
      updatedAt: now,
      payload: body.approvalPayload?.payload || {},
      approvalId
    };
    await createJob(placeholder);
    job = placeholder;
  } else {
    job.status = "PENDING";
    job.updatedAt = now;
    job.approvalId = approvalId;
    await updateJob(job);
  }

  const approval: ApprovalRecord = {
    id: approvalId,
    jobId: job.id,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
    reason: body.approvalPayload?.reason || "Approval required",
    risk: body.approvalPayload?.risk || "unknown"
  };
  await createApproval(approval);

  return NextResponse.json({ ok: true, approvalId });
}
