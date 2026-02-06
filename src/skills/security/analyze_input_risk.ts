import type { SkillDefinition } from "../../types/skill";
import { classifyRisk, detectPromptInjection, detectScamIndicators } from "../../core/defense";

interface AnalyzeInputRiskInput {
  text: string;
}

interface AnalyzeInputRiskOutput {
  riskLevel: string;
  promptInjection: string[];
  scamIndicators: string[];
}

export const analyzeInputRiskSkill: SkillDefinition<
  AnalyzeInputRiskInput,
  AnalyzeInputRiskOutput
> = {
  name: "analyze_input_risk",
  description: "Analyze input for prompt injection or scam indicators.",
  inputSchema: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", description: "Input to analyze." }
    }
  },
  riskLevel: "LOW",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "analyze_input_risk",
    target: () => "input"
  },
  handler: (input) => {
    if (!input.text || typeof input.text !== "string") {
      throw new Error("text is required.");
    }
    const injection = detectPromptInjection(input.text);
    const scam = detectScamIndicators(input.text);
    const riskLevel = classifyRisk(input.text);
    return {
      riskLevel,
      promptInjection: injection.reasons,
      scamIndicators: scam.reasons
    };
  }
};
