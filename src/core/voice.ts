export interface VoiceParseResult {
  intent: "status" | "plan" | "search" | "read" | "unknown";
  entities?: Record<string, string>;
}

export function parseVoiceText(text: string): VoiceParseResult {
  const trimmed = text.trim();
  const lowered = trimmed.toLowerCase();
  if (!trimmed) {
    return { intent: "unknown" };
  }
  if (lowered.includes("status")) {
    return { intent: "status" };
  }
  if (lowered.startsWith("plan") || lowered.includes("help me plan")) {
    return { intent: "plan" };
  }
  if (lowered.startsWith("search")) {
    return {
      intent: "search",
      entities: { query: trimmed.replace(/^search\s*/i, "") }
    };
  }
  if (lowered.startsWith("read")) {
    return {
      intent: "read",
      entities: { path: trimmed.replace(/^read\s*/i, "") }
    };
  }
  return { intent: "unknown" };
}
