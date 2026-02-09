import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/auth";
import { getJob, getResult } from "@/lib/store";

export async function GET(req: Request) {
  const email = await getSessionEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") || "";
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }
  const job = await getJob(jobId);
  if (!job || job.email !== email) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  const result = await getResult(jobId);
  return NextResponse.json({ result });
}
