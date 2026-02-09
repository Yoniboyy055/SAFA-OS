import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/auth";
import { listJobs, listApprovalsByJobs } from "@/lib/store";

export async function GET() {
  const email = await getSessionEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const jobs = (await listJobs(100)).filter((job) => job.email === email);
  const approvals = await listApprovalsByJobs(jobs.map((job) => job.id));
  return NextResponse.json({
    approvals: approvals.filter((approval) => approval.status === "PENDING")
  });
}
