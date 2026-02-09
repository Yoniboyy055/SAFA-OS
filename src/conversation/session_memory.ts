import * as fs from "node:fs";
import * as path from "node:path";

import type { LlmMessage } from "../core/llm/types";

export type PendingAction =
  | {
      kind: "skill";
      skill: string;
      input?: Record<string, unknown>;
      createdAt: string;
      description: string;
    }
  | {
      kind: "llm";
      createdAt: string;
      description: string;
    };

export interface ConversationSessionState {
  messages: LlmMessage[];
  pending?: PendingAction;
  createdAt?: string;
  updatedAt?: string;
}

const SESSION_DIR = path.join("data", "control", "conversation_sessions");

function sanitizeSessionId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "session";
}

function resolveSessionPath(rootDir: string, sessionId: string): string {
  const safeId = sanitizeSessionId(sessionId);
  return path.resolve(rootDir, SESSION_DIR, `session_${safeId}.json`);
}

function defaultSession(): ConversationSessionState {
  const now = new Date().toISOString();
  return {
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

export function readConversationSession(
  rootDir: string,
  sessionId: string
): ConversationSessionState {
  const sessionPath = resolveSessionPath(rootDir, sessionId);
  if (!fs.existsSync(sessionPath)) {
    return defaultSession();
  }
  try {
    const raw = fs.readFileSync(sessionPath, "utf8");
    const parsed = JSON.parse(raw) as ConversationSessionState;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      pending: parsed.pending,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt
    };
  } catch {
    return defaultSession();
  }
}

export function writeConversationSession(
  rootDir: string,
  sessionId: string,
  state: ConversationSessionState
): void {
  const sessionPath = resolveSessionPath(rootDir, sessionId);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  const payload: ConversationSessionState = {
    messages: state.messages ?? [],
    pending: state.pending,
    createdAt: state.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(sessionPath, JSON.stringify(payload, null, 2), "utf8");
}

export function appendConversationMessage(
  rootDir: string,
  sessionId: string,
  message: LlmMessage
): void {
  const state = readConversationSession(rootDir, sessionId);
  writeConversationSession(rootDir, sessionId, {
    ...state,
    messages: [...state.messages, message]
  });
}
