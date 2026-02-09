import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/auth";
import {
  enqueueWorkerJob,
  getApproval,
  getJob,
  updateApproval,
  updateJob
} from "@/lib/store";

export async function POST(
  req: Request,
  context: { params: { id: string } }
) {
  const email = await getSessionEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const body = (await req.json()) as { decision?: "APPROVE" | "DENY" };
  const decision = body.decision;
  if (decision !== "APPROVE" && decision !== "DENY") {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }
  const approval = await getApproval(context.params.id);
  if (!approval) {
    return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  }
  const job = await getJob(approval.jobId);
  if (!job || job.email !== email) {
    return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  approval.status = decision === "APPROVE" ? "APPROVED" : "DENIED";
  approval.updatedAt = now;
  await updateApproval(approval);

  job.status = approval.status === "APPROVED" ? "APPROVED" : "DENIED";
  job.updatedAt = now;
  await updateJob(job);

  if (approval.status === "APPROVED") {
    await enqueueWorkerJob(job.id);
  }

  return NextResponse.json({ ok: true, approval, job });
}
