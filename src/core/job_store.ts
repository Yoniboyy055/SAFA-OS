import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { RiskLevel } from "../types/skill";

export type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELED";

export type JobStepStatus =
  | "PENDING"
  | "APPROVED"
  | "PAUSED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export interface DelegatedTokenRecord {
  token: string;
  actor: string;
  scope: string[];
  expiresAt: string;
}

export interface JobStep {
  id: string;
  skill: string;
  input: Record<string, unknown>;
  status: JobStepStatus;
  requiresApproval?: boolean;
  riskLevel?: RiskLevel;
  approvalId?: string;
  error?: string;
}

export interface JobRecord {
  id: string;
  ownerId: string;
  status: JobStatus;
  scope: string[];
  allowedTools: string[];
  token?: DelegatedTokenRecord;
  ttlMs?: number;
  expiresAt?: string;
  steps: JobStep[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface JobEvent {
  timestamp: string;
  type: "upsert";
  job: JobRecord;
}

function resolveJobsPath(rootDir: string): string {
  return path.join(rootDir, "data", "jobs.json");
}

function resolveJobsLogPath(rootDir: string): string {
  return path.join(rootDir, "data", "jobs.log");
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function readJobs(rootDir: string): JobRecord[] {
  const filePath = resolveJobsPath(rootDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JobRecord[]) : [];
  } catch {
    return [];
  }
}

function writeJobs(rootDir: string, jobs: JobRecord[]): void {
  const filePath = resolveJobsPath(rootDir);
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(jobs, null, 2), "utf8");
}

function appendEvent(rootDir: string, job: JobRecord): void {
  const logPath = resolveJobsLogPath(rootDir);
  ensureDir(logPath);
  const event: JobEvent = {
    timestamp: new Date().toISOString(),
    type: "upsert",
    job
  };
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, "utf8");
}

export function listJobs(rootDir: string): JobRecord[] {
  return readJobs(rootDir);
}

export function getJob(rootDir: string, id: string): JobRecord | undefined {
  return readJobs(rootDir).find((job) => job.id === id);
}

export function upsertJob(
  rootDir: string,
  input: Omit<JobRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }
): JobRecord {
  const now = new Date().toISOString();
  const id = input.id ?? hashValue(`${input.ownerId}:${now}`);
  const jobs = readJobs(rootDir);
  const existingIndex = jobs.findIndex((job) => job.id === id);
  const record: JobRecord = {
    id,
    ownerId: input.ownerId,
    status: input.status,
    scope: input.scope,
    allowedTools: input.allowedTools,
    token: input.token,
    ttlMs: input.ttlMs,
    expiresAt: input.expiresAt,
    steps: input.steps,
    createdAt: existingIndex >= 0 ? jobs[existingIndex].createdAt : now,
    updatedAt: now,
    error: input.error
  };
  if (existingIndex >= 0) {
    jobs[existingIndex] = record;
  } else {
    jobs.push(record);
  }
  writeJobs(rootDir, jobs);
  appendEvent(rootDir, record);
  return record;
}

export function createJob(
  rootDir: string,
  input: Omit<JobRecord, "id" | "status" | "createdAt" | "updatedAt">
): JobRecord {
  const now = new Date().toISOString();
  const id = hashValue(`${input.ownerId}:${now}:${JSON.stringify(input.steps)}`);
  const expiresAt =
    typeof input.ttlMs === "number"
      ? new Date(Date.now() + input.ttlMs).toISOString()
      : input.expiresAt;
  const record: JobRecord = {
    id,
    ownerId: input.ownerId,
    status: "QUEUED",
    scope: input.scope,
    allowedTools: input.allowedTools,
    token: input.token,
    ttlMs: input.ttlMs,
    expiresAt,
    steps: input.steps,
    createdAt: now,
    updatedAt: now,
    error: input.error
  };
  const jobs = readJobs(rootDir);
  jobs.push(record);
  writeJobs(rootDir, jobs);
  appendEvent(rootDir, record);
  return record;
}
