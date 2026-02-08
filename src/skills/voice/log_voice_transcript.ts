import type { SkillDefinition } from "../../types/skill";
import { appendVoiceLog } from "../../core/voice_log";

interface LogVoiceInput {
  transcript: string;
}

interface LogVoiceOutput {
  id: string;
  createdAt: string;
  intent: string;
  redacted: boolean;
}

export const logVoiceTranscriptSkill: SkillDefinition<
  LogVoiceInput,
  LogVoiceOutput
> = {
  name: "log_voice_transcript",
  description: "Log a voice transcript for replay (redacted, governed).",
  inputSchema: {
    type: "object",
    required: ["transcript"],
    properties: {
      transcript: { type: "string", description: "Transcript to log." }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "log_voice_transcript",
    target: () => "voice_logs"
  },
  handler: (input, context) => {
    const entry = appendVoiceLog(context.config.rootDir, input.transcript ?? "");
    return {
      id: entry.id,
      createdAt: entry.createdAt,
      intent: entry.intent,
      redacted: entry.redacted
    };
  }
};
