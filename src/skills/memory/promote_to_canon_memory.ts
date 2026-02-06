import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { writeTierEntry } from "../../core/memory_store";

interface PromoteToCanonInput {
  facts: string;
  title?: string;
  allowPii?: boolean;
}

interface PromoteToCanonOutput {
  id: string;
  file: string;
  redacted: boolean;
  findings: string[];
}

export const promoteToCanonMemorySkill: SkillDefinition<
  PromoteToCanonInput,
  PromoteToCanonOutput
> = {
  name: "promote_to_canon_memory",
  description: "Promote approved facts to memory/canon.",
  inputSchema: {
    type: "object",
    required: ["facts"],
    properties: {
      facts: { type: "string", description: "Approved canon facts." },
      title: { type: "string", description: "Optional title." },
      allowPii: { type: "boolean", description: "Allow PII in canon facts." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "promote_to_canon_memory",
    target: () => "memory/canon"
  },
  handler: (input, context) => {
    if (!input.facts || typeof input.facts !== "string") {
      throw new Error("facts is required.");
    }
    const allowPii = input.allowPii === true && context.approved;
    const redaction = redactSensitiveText(input.facts, { allowPii });
    if (redaction.hadSecrets) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "memory.canon.blocked",
        approved: context.approved,
        target: "memory/canon",
        result: "Secrets detected in canon promotion."
      });
      throw new Error("Secrets detected; cannot promote to canon memory.");
    }
    const title = input.title ?? "canon";
    const { filePath, id } = writeTierEntry(
      context.config.rootDir,
      "canon",
      title,
      redaction.redactedText
    );
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "memory.canon.write",
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
