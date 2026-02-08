import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { parseVoiceText } from "./voice";
import { redactSensitiveText } from "./sensitive";

export interface VoiceLogEntry {
  id: string;
  createdAt: string;
  transcript: string;
  intent: string;
  entities?: Record<string, string>;
  redacted: boolean;
}

export interface VoiceLogSummary {
  id: string;
  createdAt: string;
  intent: string;
  preview: string;
}

const VOICE_DIR = path.join("data", "voice");
const VOICE_FILE = "voice_logs.json";

function resolveVoiceLogPath(rootDir: string): string {
  return path.resolve(rootDir, VOICE_DIR, VOICE_FILE);
}

function readVoiceLogs(rootDir: string): VoiceLogEntry[] {
  const logPath = resolveVoiceLogPath(rootDir);
  if (!fs.existsSync(logPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(logPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as VoiceLogEntry[];
    }
  } catch {
    return [];
  }
  return [];
}

function writeVoiceLogs(rootDir: string, entries: VoiceLogEntry[]): void {
  const logPath = resolveVoiceLogPath(rootDir);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2), "utf8");
}

export function appendVoiceLog(
  rootDir: string,
  transcript: string
): VoiceLogEntry {
  const safeTranscript = typeof transcript === "string" ? transcript : "";
  const parsed = parseVoiceText(safeTranscript);
  const redaction = redactSensitiveText(safeTranscript);
  const entry: VoiceLogEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    transcript: redaction.redactedText,
    intent: parsed.intent,
    entities: parsed.entities,
    redacted: redaction.redacted
  };
  const entries = readVoiceLogs(rootDir);
  entries.push(entry);
  writeVoiceLogs(rootDir, entries);
  return entry;
}

export function listVoiceLogs(rootDir: string): VoiceLogSummary[] {
  return readVoiceLogs(rootDir).map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    intent: entry.intent,
    preview: entry.transcript.slice(0, 120)
  }));
}

export function getVoiceLog(rootDir: string, id: string): VoiceLogEntry {
  const entry = readVoiceLogs(rootDir).find((item) => item.id === id);
  if (!entry) {
    throw new Error("Voice log not found.");
  }
  return entry;
}
