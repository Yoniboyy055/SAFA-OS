import * as fs from "node:fs";
import * as path from "node:path";

import { AuditLogger } from "../core/audit";
import { loadConfig } from "../core/config";
import { createDelegatedJobToken } from "../core/execution_gate";
import { ApprovalStore } from "../core/approval_store";
import { createJob, getJob, type JobRecord, type JobStep } from "../core/job_store";
import { RelayClient, type RelayJobPayload } from "./relay_client";

export interface RelayPollerOptions {
  baseUrl: string;
  workerKey: string;
  actor: string;
  pollIntervalMs?: number;
  configPath?: string;
}

interface RelayMapEntry {
  relayJobId: string;
  localJobId: string;
}

interface ApprovalSentRecord {
  approvalId: string;
}

function loadJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function ensureScope(payload: Record<string, unknown>): string[] {
  const scope = payload.scope;
  if (Array.isArray(scope) && scope.every((item) => typeof item === "string")) {
    return scope as string[];
  }
  const allowedTools = payload.allowedTools;
  if (Array.isArray(allowedTools) && allowedTools.every((item) => typeof item === "string")) {
    return allowedTools as string[];
  }
  throw new Error("Relay payload requires scope or allowedTools array.");
}

function ensureSteps(payload: Record<string, unknown>): JobStep[] {
  const steps = payload.steps;
  if (!Array.isArray(steps)) {
    throw new Error("Relay payload requires steps array.");
  }
  return steps as JobStep[];
}

export function startRelayPoller(options: RelayPollerOptions): void {
  const config = loadConfig(options.configPath);
  const audit = new AuditLogger({
    logPath: config.audit.logPath,
    redactKeys: config.audit.redactKeys
  });
  const approvalStore = new ApprovalStore(config.rootDir);
  const relayClient = new RelayClient({
    baseUrl: options.baseUrl,
    workerKey: options.workerKey
  });
  const pollIntervalMs = options.pollIntervalMs ?? 4000;

  const mapPath = path.join(config.rootDir, "data", "relay_map.json");
  const approvalsPath = path.join(config.rootDir, "data", "relay_approvals.json");

  setInterval(async () => {
    const relayMap = loadJson<RelayMapEntry[]>(mapPath, []);
    const sentApprovals = loadJson<ApprovalSentRecord[]>(approvalsPath, []);

    const queue = await relayClient.fetchQueue();
    for (const job of queue) {
      if (relayMap.some((entry) => entry.relayJobId === job.id)) {
        continue;
      }
      await relayClient.claim(job.id);
      const localJobId = createLocalJob(job, options.actor, config.rootDir);
      relayMap.push({ relayJobId: job.id, localJobId });
      saveJson(mapPath, relayMap);
    }

    for (const entry of relayMap.slice()) {
      const localJob = getJob(config.rootDir, entry.localJobId);
      if (!localJob) {
        continue;
      }
      if (localJob.status === "COMPLETED" || localJob.status === "FAILED") {
        await relayClient.postResults(
          entry.relayJobId,
          localJob.error || "",
          { status: localJob.status },
          localJob.status === "FAILED" ? "FAILED" : "DONE"
        );
        const index = relayMap.findIndex((item) => item.relayJobId === entry.relayJobId);
        if (index >= 0) {
          relayMap.splice(index, 1);
        }
        saveJson(mapPath, relayMap);
      }
    }

    const pendingApprovals = approvalStore.listPending();
    for (const approval of pendingApprovals) {
      if (sentApprovals.some((record) => record.approvalId === approval.id)) {
        continue;
      }
      if (!approval.jobId) {
        continue;
      }
      await relayClient.postApproval(approval.jobId, {
        approvalId: approval.id,
        reason: approval.reason || "Approval required",
        risk: approval.riskLevel || "unknown",
        createdAt: approval.createdAt
      });
      sentApprovals.push({ approvalId: approval.id });
      saveJson(approvalsPath, sentApprovals);
    }
  }, pollIntervalMs);

  audit.log({
    timestamp: new Date().toISOString(),
    actor: options.actor,
    action: "relay.poller.start",
    approved: true,
    target: options.baseUrl,
    result: "Relay poller started."
  });
}

function createLocalJob(job: RelayJobPayload, actor: string, rootDir: string): string {
  const payload = job.payload || {};
  const scope = ensureScope(payload);
  const steps = ensureSteps(payload);
  const ttlMs = typeof payload.ttlMs === "number" ? payload.ttlMs : 60 * 60 * 1000;
  const token = createDelegatedJobToken(actor, scope, ttlMs);
  const record: Omit<JobRecord, "id" | "status" | "createdAt" | "updatedAt"> = {
    ownerId: actor,
    scope,
    allowedTools: scope,
    token,
    ttlMs,
    steps,
    error: undefined,
    expiresAt: undefined
  };
  const created = createJob(rootDir, record);
  return created.id;
}
