import * as fs from "node:fs";
import * as path from "node:path";

export interface ExecutionRecord {
  id: string;
  kind: "plan" | "skill";
  actor: string;
  success: boolean;
  createdAt: string;
  planHash?: string;
  skill?: string;
  steps?: Array<{ stepId: string; skill: string; success: boolean }>;
  error?: string;
}

export class ExecutionStore {
  private readonly filePath: string;
  private readonly logPath: string;

  constructor(rootDir: string) {
    this.filePath = path.join(rootDir, "data", "executions.json");
    this.logPath = path.join(rootDir, "data", "executions.log");
  }

  list(limit = 50): ExecutionRecord[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed) ? (parsed as ExecutionRecord[]) : [];
      if (limit <= 0) {
        return entries;
      }
      return entries.slice(-limit);
    } catch {
      return [];
    }
  }

  append(record: ExecutionRecord): void {
    const existing = this.list(0);
    existing.push(record);
    this.write(existing);
    this.appendLog(record);
  }

  private write(entries: ExecutionRecord[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }

  private appendLog(record: ExecutionRecord): void {
    const dir = path.dirname(this.logPath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      record
    };
    fs.appendFileSync(this.logPath, `${JSON.stringify(payload)}\n`, "utf8");
  }
}
