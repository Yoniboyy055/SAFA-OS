import * as fs from "node:fs";
import * as path from "node:path";

import type { ApprovalRequest, ApprovalStatus } from "./approvals";

export interface ApprovalQueueRecord {
  request: ApprovalRequest;
  status: ApprovalStatus;
  key: string;
  summary: string;
}

export class ApprovalQueueStore {
  private readonly filePath: string;
  private readonly logPath: string;

  constructor(rootDir: string) {
    this.filePath = path.join(rootDir, "data", "approval_queue.json");
    this.logPath = path.join(rootDir, "data", "approval_queue.log");
  }

  list(): ApprovalQueueRecord[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ApprovalQueueRecord[]) : [];
    } catch {
      return [];
    }
  }

  listPending(): ApprovalQueueRecord[] {
    return this.list().filter((record) => record.status === "PENDING");
  }

  get(id: string): ApprovalQueueRecord | undefined {
    return this.list().find((record) => record.request.id === id);
  }

  findApprovedByKey(key: string): ApprovalQueueRecord | undefined {
    return this.list().find(
      (record) => record.key === key && record.status === "APPROVED"
    );
  }

  upsert(record: ApprovalQueueRecord): ApprovalQueueRecord {
    const existing = this.list();
    const index = existing.findIndex(
      (entry) => entry.request.id === record.request.id
    );
    if (index >= 0) {
      existing[index] = record;
    } else {
      existing.push(record);
    }
    this.write(existing);
    this.appendLog(record);
    return record;
  }

  private write(entries: ApprovalQueueRecord[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }

  private appendLog(record: ApprovalQueueRecord): void {
    const dir = path.dirname(this.logPath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      record
    };
    fs.appendFileSync(this.logPath, `${JSON.stringify(payload)}\n`, "utf8");
  }
}
