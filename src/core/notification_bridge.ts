import * as fs from "node:fs";
import * as path from "node:path";

import type { AuditLogger } from "./audit";

export type NotificationMode = "mock" | "off";

export interface ApprovalNotificationPayload {
  message: "Approval needed";
  job_id: string;
}

export interface NotificationEvent {
  timestamp: string;
  type: "approval_needed";
  payload: ApprovalNotificationPayload;
}

export class NotificationBridge {
  private readonly mode: NotificationMode;
  private readonly filePath: string;
  private readonly logPath: string;

  constructor(
    rootDir: string,
    private readonly audit: AuditLogger,
    mode: NotificationMode = (process.env.SAFA_NOTIFICATION_MODE as NotificationMode) || "mock"
  ) {
    this.mode = mode === "off" ? "off" : "mock";
    this.filePath = path.join(rootDir, "data", "notifications.json");
    this.logPath = path.join(rootDir, "data", "notifications.log");
  }

  notifyApprovalNeeded(jobId?: string): boolean {
    if (!jobId) {
      return false;
    }
    if (this.mode !== "mock") {
      return false;
    }
    const event: NotificationEvent = {
      timestamp: new Date().toISOString(),
      type: "approval_needed",
      payload: { message: "Approval needed", job_id: jobId }
    };
    this.append(event);
    this.audit.log({
      timestamp: event.timestamp,
      actor: "system",
      action: "notification.sent",
      approved: true,
      target: `job:${jobId}`,
      result: JSON.stringify(event.payload)
    });
    return true;
  }

  private append(event: NotificationEvent): void {
    const existing = this.readAll();
    existing.push(event);
    this.writeAll(existing);
    this.appendLog(event);
  }

  private readAll(): NotificationEvent[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as NotificationEvent[]) : [];
    } catch {
      return [];
    }
  }

  private writeAll(events: NotificationEvent[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(events, null, 2), "utf8");
  }

  private appendLog(event: NotificationEvent): void {
    const dir = path.dirname(this.logPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(this.logPath, `${JSON.stringify(event)}\n`, "utf8");
  }
}
