import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/auth";
import {
  createApproval,
  createJob,
  listJobs,
  type ApprovalRecord,
  type JobRecord
} from "@/lib/store";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const email = await getSessionEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const body = (await req.json()) as { message?: string; payload?: any };
  const message = body.message || "";
  if (!message.trim()) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const jobId = createId("job");
  const approvalId = createId("apr");

  const job: JobRecord = {
    id: jobId,
    status: "PENDING",
    email,
    createdAt: now,
    updatedAt: now,
    payload: {
      message,
      ...(body.payload || {})
    },
    approvalId
  };
  const approval: ApprovalRecord = {
    id: approvalId,
    jobId,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
    reason: "User request",
    risk: "unknown"
  };

  await createJob(job);
  await createApproval(approval);

  return NextResponse.json({ ok: true, jobId, approvalId });
}

export async function GET() {
  const email = await getSessionEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const jobs = await listJobs(100);
  return NextResponse.json({
    jobs: jobs.filter((job) => job.email === email)
  });
}
