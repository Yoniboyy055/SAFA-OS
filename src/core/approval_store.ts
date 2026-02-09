import * as fs from "node:fs";
import * as path from "node:path";

import type { ApprovalRequest } from "./approvals";
import type { RiskLevel } from "../types/skill";

export class ApprovalStore {
  private readonly filePath: string;
  private readonly logPath: string;

  constructor(rootDir: string) {
    this.filePath = path.join(rootDir, "data", "approvals.json");
    this.logPath = path.join(rootDir, "data", "approvals.log");
  }

  list(): ApprovalRequest[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ApprovalRequest[]) : [];
    } catch {
      return [];
    }
  }

  listPending(): ApprovalRequest[] {
    return this.list()
      .filter((entry) => entry.status === "PENDING")
      .slice()
      .sort(sortByCreatedAt);
  }

  get(id: string): ApprovalRequest | undefined {
    return this.list().find((entry) => entry.id === id);
  }

  getByJob(jobId: string, stepId?: string): ApprovalRequest | undefined {
    return this.list()
      .filter((entry) => entry.jobId === jobId)
      .find((entry) => (stepId ? entry.target === stepId : true));
  }

  resolve(
    id: string,
    input: {
      status: "APPROVED" | "DENIED" | "EXPIRED";
      resolvedBy: string;
      resolvedAt?: string;
      resolutionNote?: string;
    }
  ): ApprovalRequest | undefined {
    const existing = this.list();
    const index = existing.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return undefined;
    }
    const approval = existing[index];
    if (approval.status !== "PENDING") {
      return approval;
    }
    const resolvedAt = input.resolvedAt ?? new Date().toISOString();
    approval.status = input.status;
    approval.resolvedBy = input.resolvedBy;
    approval.resolvedAt = resolvedAt;
    approval.decidedBy = input.resolvedBy;
    approval.decidedAt = resolvedAt;
    if (input.resolutionNote) {
      approval.resolutionNote = input.resolutionNote;
      approval.reason = input.resolutionNote;
    }
    this.write(existing);
    this.appendLog(approval);
    return approval;
  }

  upsert(request: ApprovalRequest): void {
    const existing = this.list();
    const index = existing.findIndex((entry) => entry.id === request.id);
    if (index >= 0) {
      existing[index] = request;
    } else {
      existing.push(request);
    }
    this.write(existing);
    this.appendLog(request);
  }

  private write(entries: ApprovalRequest[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }

  private appendLog(request: ApprovalRequest): void {
    const dir = path.dirname(this.logPath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      request
    };
    fs.appendFileSync(this.logPath, `${JSON.stringify(payload)}\n`, "utf8");
  }
}

function sortByCreatedAt(a: ApprovalRequest, b: ApprovalRequest): number {
  return a.createdAt.localeCompare(b.createdAt);
}

export function shouldRequireApproval(riskLevel?: RiskLevel): boolean {
  return riskLevel === "MEDIUM" || riskLevel === "HIGH";
}
