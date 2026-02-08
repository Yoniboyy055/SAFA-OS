export type VoiceIntent = "plan" | "unknown";

export interface VoiceParseResult {
  transcript: string;
  normalized: string;
  intent: VoiceIntent;
  commandText: string;
  suggestedLine: string;
  confidence: number;
}

function extractPlanText(normalized: string): string | undefined {
  const patterns = [
    /^plan\s+(.+)$/i,
    /^create\s+plan\s+(.+)$/i,
    /^make\s+a\s+plan\s+for\s+(.+)$/i,
    /^plan\s+for\s+(.+)$/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

export function parseVoiceTranscript(transcript: string): VoiceParseResult {
  const normalized = transcript.trim();
  if (!normalized) {
    return {
      transcript,
      normalized: "",
      intent: "unknown",
      commandText: "",
      suggestedLine: "",
      confidence: 0
    };
  }
  const planText = extractPlanText(normalized);
  const commandText = planText ?? normalized;
  const intent: VoiceIntent = "plan";
  const confidence = planText ? 0.72 : 0.4;
  return {
    transcript,
    normalized,
    intent,
    commandText,
    suggestedLine: `SAFA: PLAN ${commandText}`,
    confidence
  };
}
