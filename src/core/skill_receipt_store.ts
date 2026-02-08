import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export type SkillReceiptStatus = "SUCCESS" | "ERROR" | "DENIED";

export interface SkillReceipt {
  id: string;
  skill: string;
  status: SkillReceiptStatus;
  actor: string;
  approved: boolean;
  createdAt: string;
  inputHash: string;
  outputHash?: string;
  error?: string;
}

function resolveReceiptsPath(rootDir: string): string {
  return path.join(rootDir, "data", "skill_receipts.json");
}

function resolveReceiptsLogPath(rootDir: string): string {
  return path.join(rootDir, "data", "skill_receipts.log");
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? "");
  } catch {
    return String(value ?? "");
  }
}

export function createReceiptId(skill: string, createdAt: string): string {
  return `rcpt-${hashValue(`${skill}:${createdAt}`)}`.slice(0, 18);
}

export function hashInput(input: unknown): string {
  return hashValue(safeJson(input));
}

export function hashOutput(output: unknown): string {
  return hashValue(safeJson(output));
}

function readReceipts(rootDir: string): SkillReceipt[] {
  const filePath = resolveReceiptsPath(rootDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SkillReceipt[]) : [];
  } catch {
    return [];
  }
}

function writeReceipts(rootDir: string, receipts: SkillReceipt[]): void {
  const filePath = resolveReceiptsPath(rootDir);
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(receipts, null, 2), "utf8");
}

function appendReceipt(rootDir: string, receipt: SkillReceipt): void {
  const logPath = resolveReceiptsLogPath(rootDir);
  ensureDir(logPath);
  fs.appendFileSync(logPath, `${JSON.stringify(receipt)}\n`, "utf8");
}

export function listSkillReceipts(rootDir: string): SkillReceipt[] {
  return readReceipts(rootDir);
}

export function recordSkillReceipt(rootDir: string, receipt: SkillReceipt): void {
  const receipts = readReceipts(rootDir);
  receipts.push(receipt);
  writeReceipts(rootDir, receipts);
  appendReceipt(rootDir, receipt);
}
