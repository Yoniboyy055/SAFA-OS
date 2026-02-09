import type { PendingAction } from "./session_memory";

export type ConversationIntent =
  | { type: "greeting" }
  | { type: "status" }
  | { type: "skills" }
  | { type: "plan"; task: string }
  | { type: "execute"; skill: string; input: Record<string, unknown> }
  | { type: "approve_pending" }
  | { type: "approve_llm" }
  | { type: "cancel_pending" }
  | { type: "model" };

function normalizeText(input: string): string {
  return input.trim();
}

function isGreeting(text: string): boolean {
  const lowered = text.toLowerCase();
  return ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "ping"].some(
    (word) => lowered === word
  );
}

export function classifyIntent(
  message: string,
  pending?: Pick<PendingAction, "kind">
): ConversationIntent {
  const text = normalizeText(message);
  const lowered = text.toLowerCase();
  const approveWords = ["yes", "approve", "go ahead", "do it", "proceed"];
  const denyWords = ["no", "cancel", "stop", "never mind"];

  if (pending) {
    if (approveWords.some((word) => lowered === word)) {
      return pending.kind === "llm" ? { type: "approve_llm" } : { type: "approve_pending" };
    }
    if (denyWords.some((word) => lowered === word)) {
      return { type: "cancel_pending" };
    }
  }

  if (isGreeting(text)) {
    return { type: "greeting" };
  }
  if (lowered.includes("status")) {
    return { type: "status" };
  }
  if (lowered.includes("skills") || lowered.includes("capabilities")) {
    return { type: "skills" };
  }
  if (lowered.startsWith("help me plan") || lowered.startsWith("plan")) {
    const task = text.replace(/^(help me plan|plan)\s*/i, "").trim();
    return { type: "plan", task: task || text };
  }
  if (lowered.includes("list files") || lowered.includes("show files")) {
    return { type: "execute", skill: "list_files", input: { path: ".", recursive: false } };
  }
  if (lowered.startsWith("search")) {
    const query = text.replace(/^search\s*(for)?\s*/i, "").trim();
    return { type: "execute", skill: "search_text", input: { path: ".", query } };
  }
  const readMatch = text.match(/^(read|open|show)\s+([^\s]+)$/i);
  if (readMatch) {
    return {
      type: "execute",
      skill: "read_file",
      input: { path: readMatch[2] }
    };
  }
  if (lowered.includes("approve") && lowered.includes("llm")) {
    return { type: "approve_llm" };
  }

  return { type: "model" };
}
