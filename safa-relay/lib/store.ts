import kv from "./kv";

export type JobStatus =
  | "PENDING"
  | "APPROVED"
  | "DENIED"
  | "RUNNING"
  | "DONE"
  | "FAILED";

export interface JobRecord {
  id: string;
  status: JobStatus;
  email: string;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
  approvalId?: string;
}

export interface ApprovalRecord {
  id: string;
  jobId: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  createdAt: string;
  updatedAt: string;
  reason?: string;
  risk?: string;
}

export interface ResultRecord {
  jobId: string;
  logs?: string;
  output?: unknown;
  createdAt: string;
}

export async function createJob(job: JobRecord): Promise<void> {
  await kv.set(`job:${job.id}`, job);
  await kv.lpush("queue:jobs", job.id);
}

export async function updateJob(job: JobRecord): Promise<void> {
  await kv.set(`job:${job.id}`, job);
}

export async function getJob(id: string): Promise<JobRecord | null> {
  return (await kv.get(`job:${id}`)) as JobRecord | null;
}

export async function listJobs(limit = 50): Promise<JobRecord[]> {
  const ids = (await kv.lrange("queue:jobs", 0, limit - 1)) as string[];
  const jobs = await Promise.all(ids.map((id) => kv.get(`job:${id}`)));
  return jobs.filter(Boolean) as JobRecord[];
}

export async function createApproval(approval: ApprovalRecord): Promise<void> {
  await kv.set(`approval:${approval.id}`, approval);
}

export async function updateApproval(approval: ApprovalRecord): Promise<void> {
  await kv.set(`approval:${approval.id}`, approval);
}

export async function getApproval(id: string): Promise<ApprovalRecord | null> {
  return (await kv.get(`approval:${id}`)) as ApprovalRecord | null;
}

export async function listApprovalsByJobs(jobIds: string[]): Promise<ApprovalRecord[]> {
  const approvals = await Promise.all(
    jobIds.map(async (jobId) => {
      const job = await getJob(jobId);
      if (!job || !job.approvalId) {
        return null;
      }
      return getApproval(job.approvalId);
    })
  );
  return approvals.filter(Boolean) as ApprovalRecord[];
}

export async function enqueueWorkerJob(jobId: string): Promise<void> {
  await kv.lpush("queue:worker", jobId);
}

export async function dequeueWorkerJob(jobId: string): Promise<void> {
  await kv.lrem("queue:worker", 0, jobId);
}

export async function listWorkerQueue(limit = 50): Promise<JobRecord[]> {
  const ids = (await kv.lrange("queue:worker", 0, limit - 1)) as string[];
  const jobs = await Promise.all(ids.map((id) => kv.get(`job:${id}`)));
  return jobs.filter(Boolean) as JobRecord[];
}

export async function saveResult(result: ResultRecord): Promise<void> {
  await kv.set(`result:${result.jobId}`, result);
}

export async function getResult(jobId: string): Promise<ResultRecord | null> {
  return (await kv.get(`result:${jobId}`)) as ResultRecord | null;
}
