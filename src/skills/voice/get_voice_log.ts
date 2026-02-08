import type { SkillDefinition } from "../../types/skill";
import { getVoiceLog } from "../../core/voice_log";

interface GetVoiceLogInput {
  id: string;
}

interface GetVoiceLogOutput {
  id: string;
  createdAt: string;
  intent: string;
  transcript: string;
  redacted: boolean;
}

export const getVoiceLogSkill: SkillDefinition<
  GetVoiceLogInput,
  GetVoiceLogOutput
> = {
  name: "get_voice_log",
  description: "Replay a redacted voice log by id.",
  inputSchema: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", description: "Voice log id to replay." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "get_voice_log",
    target: (input) => `voice_log:${input?.id ?? "unknown"}`
  },
  handler: (input, context) => {
    const entry = getVoiceLog(context.config.rootDir, input.id);
    return {
      id: entry.id,
      createdAt: entry.createdAt,
      intent: entry.intent,
      transcript: entry.transcript,
      redacted: entry.redacted
    };
  }
};
