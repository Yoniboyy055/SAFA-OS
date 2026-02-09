import * as fs from "node:fs";
import * as path from "node:path";

import type { LlmMessage } from "../core/llm/types";

export interface LlmSessionState {
  id: string;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
  messages: LlmMessage[];
}

const SESSION_DIR = path.join("data", "control", "llm_sessions");

function sanitizeSessionId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "session";
}

function resolveSessionPath(rootDir: string, sessionId: string): string {
  const safeId = sanitizeSessionId(sessionId);
  return path.resolve(rootDir, SESSION_DIR, `session_${safeId}.json`);
}

function defaultSession(id: string): LlmSessionState {
  const now = new Date().toISOString();
  return {
    id,
    approved: false,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

export function readLlmSession(rootDir: string, sessionId: string): LlmSessionState {
  const sessionPath = resolveSessionPath(rootDir, sessionId);
  if (!fs.existsSync(sessionPath)) {
    return defaultSession(sessionId);
  }
  try {
    const raw = fs.readFileSync(sessionPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LlmSessionState>;
    const fallback = defaultSession(sessionId);
    return {
      id: parsed.id ?? sessionId,
      approved: Boolean(parsed.approved),
      createdAt: parsed.createdAt ?? fallback.createdAt,
      updatedAt: parsed.updatedAt ?? fallback.updatedAt,
      messages: Array.isArray(parsed.messages) ? parsed.messages : []
    };
  } catch {
    return defaultSession(sessionId);
  }
}

function writeLlmSession(rootDir: string, state: LlmSessionState): void {
  const sessionPath = resolveSessionPath(rootDir, state.id);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2), "utf8");
}

export function approveLlmSession(rootDir: string, sessionId: string): LlmSessionState {
  const state = readLlmSession(rootDir, sessionId);
  const updated: LlmSessionState = {
    ...state,
    approved: true,
    updatedAt: new Date().toISOString()
  };
  writeLlmSession(rootDir, updated);
  return updated;
}

export function appendMessage(
  rootDir: string,
  sessionId: string,
  message: LlmMessage
): LlmSessionState {
  const state = readLlmSession(rootDir, sessionId);
  const updated: LlmSessionState = {
    ...state,
    messages: [...state.messages, message],
    updatedAt: new Date().toISOString()
  };
  writeLlmSession(rootDir, updated);
  return updated;
}
