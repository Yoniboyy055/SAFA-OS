import * as fs from "node:fs";
import * as path from "node:path";

import type { VoiceParseResult } from "./voice_parser";

export interface VoiceLogEntry {
  id: string;
  actor: string;
  transcript: string;
  parsed?: VoiceParseResult;
  createdAt: string;
}

export class VoiceLogStore {
  private readonly filePath: string;
  private readonly logPath: string;

  constructor(rootDir: string) {
    this.filePath = path.join(rootDir, "data", "voice_log.json");
    this.logPath = path.join(rootDir, "data", "voice_log.log");
  }

  list(limit = 50): VoiceLogEntry[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed) ? (parsed as VoiceLogEntry[]) : [];
      if (limit <= 0) {
        return entries;
      }
      return entries.slice(-limit);
    } catch {
      return [];
    }
  }

  append(entry: VoiceLogEntry): void {
    const existing = this.list(0);
    existing.push(entry);
    this.write(existing);
    this.appendLog(entry);
  }

  private write(entries: VoiceLogEntry[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), "utf8");
  }

  private appendLog(entry: VoiceLogEntry): void {
    const dir = path.dirname(this.logPath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      entry
    };
    fs.appendFileSync(this.logPath, `${JSON.stringify(payload)}\n`, "utf8");
  }
}
