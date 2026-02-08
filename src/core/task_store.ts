import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export type TaskStatus = "PLANNED" | "PENDING" | "APPROVED" | "EXECUTED" | "FAILED";

export interface TaskRecord {
  id: string;
  commandText: string;
  status: TaskStatus;
  actor?: string;
  planHash?: string;
  approvalId?: string;
  resultSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskEvent {
  timestamp: string;
  type: "upsert";
  task: TaskRecord;
}

function resolveTasksPath(rootDir: string): string {
  return path.join(rootDir, "data", "tasks.json");
}

function resolveTasksLogPath(rootDir: string): string {
  return path.join(rootDir, "data", "tasks.log");
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

function readTasks(rootDir: string): TaskRecord[] {
  const filePath = resolveTasksPath(rootDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TaskRecord[]) : [];
  } catch {
    return [];
  }
}

function writeTasks(rootDir: string, tasks: TaskRecord[]): void {
  const filePath = resolveTasksPath(rootDir);
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), "utf8");
}

function appendEvent(rootDir: string, task: TaskRecord): void {
  const logPath = resolveTasksLogPath(rootDir);
  ensureDir(logPath);
  const event: TaskEvent = {
    timestamp: new Date().toISOString(),
    type: "upsert",
    task
  };
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, "utf8");
}

export function listTasks(rootDir: string): TaskRecord[] {
  return readTasks(rootDir);
}

export function getTask(rootDir: string, id: string): TaskRecord | undefined {
  return readTasks(rootDir).find((task) => task.id === id);
}

export function upsertTask(
  rootDir: string,
  input: Omit<TaskRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }
): TaskRecord {
  const now = new Date().toISOString();
  const id = input.id ?? hashValue(`${input.commandText}:${now}`);
  const tasks = readTasks(rootDir);
  const existingIndex = tasks.findIndex((task) => task.id === id);
  const record: TaskRecord = {
    id,
    commandText: input.commandText,
    status: input.status,
    actor: input.actor,
    planHash: input.planHash,
    approvalId: input.approvalId,
    resultSummary: input.resultSummary,
    createdAt: existingIndex >= 0 ? tasks[existingIndex].createdAt : now,
    updatedAt: now
  };
  if (existingIndex >= 0) {
    tasks[existingIndex] = record;
  } else {
    tasks.push(record);
  }
  writeTasks(rootDir, tasks);
  appendEvent(rootDir, record);
  return record;
}
