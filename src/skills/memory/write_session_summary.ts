import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { writeTierEntry } from "../../core/memory_store";

interface WriteSessionSummaryInput {
  summary: string;
  title?: string;
  allowPii?: boolean;
}

interface WriteSessionSummaryOutput {
  id: string;
  file: string;
  redacted: boolean;
  findings: string[];
}

export const writeSessionSummarySkill: SkillDefinition<
  WriteSessionSummaryInput,
  WriteSessionSummaryOutput
> = {
  name: "write_session_summary",
  description: "Write a redacted session summary to memory/work.",
  inputSchema: {
    type: "object",
    required: ["summary"],
    properties: {
      summary: { type: "string", description: "Session summary text." },
      title: { type: "string", description: "Optional title." },
      allowPii: { type: "boolean", description: "Allow PII in summary." }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "write_session_summary",
    target: () => "memory/work"
  },
  handler: (input, context) => {
    if (!input.summary || typeof input.summary !== "string") {
      throw new Error("summary is required.");
    }
    const allowPii = input.allowPii === true && context.approved;
    const redaction = redactSensitiveText(input.summary, { allowPii });
    const title = input.title ?? "session";
    const { filePath, id } = writeTierEntry(
      context.config.rootDir,
      "work",
      title,
      redaction.redactedText
    );
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "memory.work.write",
      approved: context.approved,
      target: path.relative(context.config.rootDir, filePath),
      result: JSON.stringify({
        redacted: redaction.redacted,
        findings: redaction.findings
      })
    });
    return {
      id,
      file: filePath,
      redacted: redaction.redacted,
      findings: redaction.findings
    };
  }
};
