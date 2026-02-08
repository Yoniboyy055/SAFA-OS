import type { SkillDefinition } from "../../types/skill";
import { parseVoiceText } from "../../core/voice";

interface ParseVoiceInput {
  transcript: string;
}

interface ParseVoiceOutput {
  intent: string;
  entities?: Record<string, string>;
}

export const parseVoiceCommandSkill: SkillDefinition<
  ParseVoiceInput,
  ParseVoiceOutput
> = {
  name: "parse_voice_command",
  description: "Parse a voice transcript into a local intent (no execution).",
  inputSchema: {
    type: "object",
    required: ["transcript"],
    properties: {
      transcript: { type: "string", description: "Voice transcript text." }
    }
  },
  riskLevel: "LOW",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "parse_voice_command",
    target: () => "voice"
  },
  handler: (input) => {
    const parsed = parseVoiceText(input.transcript ?? "");
    return {
      intent: parsed.intent,
      entities: parsed.entities
    };
  }
};
