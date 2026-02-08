import * as fs from "node:fs";
import * as path from "node:path";

import type { ApprovalRequest } from "./approvals";

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

  get(id: string): ApprovalRequest | undefined {
    return this.list().find((entry) => entry.id === id);
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
