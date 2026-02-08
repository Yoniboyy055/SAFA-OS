import type { SkillDefinition } from "../../types/skill";
import { listVoiceLogs } from "../../core/voice_log";

interface ListVoiceLogsOutput {
  logs: {
    id: string;
    createdAt: string;
    intent: string;
    preview: string;
  }[];
}

export const listVoiceLogsSkill: SkillDefinition<
  Record<string, never>,
  ListVoiceLogsOutput
> = {
  name: "list_voice_logs",
  description: "List redacted voice logs for replay review.",
  inputSchema: {
    type: "object",
    properties: {}
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "list_voice_logs",
    target: () => "voice_logs"
  },
  handler: (_input, context) => {
    return {
      logs: listVoiceLogs(context.config.rootDir)
    };
  }
};
