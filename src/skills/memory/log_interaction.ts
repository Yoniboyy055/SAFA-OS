import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { appendRawEntry } from "../../core/memory_store";

interface LogInteractionInput {
  text: string;
  source?: string;
  tags?: string[];
}

interface LogInteractionOutput {
  file: string;
  redacted: boolean;
  findings: string[];
}

export const logInteractionSkill: SkillDefinition<
  LogInteractionInput,
  LogInteractionOutput
> = {
  name: "log_interaction",
  description: "Append a redacted interaction entry to memory/raw.",
  inputSchema: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", description: "Interaction text or event." },
      source: { type: "string", description: "Source label." },
      tags: { type: "array", description: "Optional tags." }
    }
  },
  riskLevel: "LOW",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "log_interaction",
    target: () => "memory/raw"
  },
  handler: (input, context) => {
    if (!input.text || typeof input.text !== "string") {
      throw new Error("text is required.");
    }
    const redaction = redactSensitiveText(input.text, { allowPii: false });
    const entry = {
      timestamp: new Date().toISOString(),
      actor: context.actor,
      source: input.source ?? "interaction",
      tags: Array.isArray(input.tags) ? input.tags : [],
      text: redaction.redactedText,
      redacted: redaction.redacted,
      findings: redaction.findings
    };
    const { filePath } = appendRawEntry(context.config.rootDir, entry);
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "memory.raw.append",
      approved: context.approved,
      target: path.relative(context.config.rootDir, filePath),
      result: JSON.stringify({
        redacted: redaction.redacted,
        findings: redaction.findings
      })
    });
    return {
      file: filePath,
      redacted: redaction.redacted,
      findings: redaction.findings
    };
  }
};
