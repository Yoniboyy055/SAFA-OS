import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import {
  assertAllowlistedPath,
  writeMemoryEntry
} from "../../core/memory_vault";

interface RequestDocPackInput {
  title: string;
  sections?: string[];
  format?: "md" | "txt";
}

interface RequestDocPackOutput {
  artifactId: string;
  artifactPath: string;
  plan: Record<string, unknown>;
  risks: string[];
  estimated_cost: number;
}

export const requestDocPackSkill: SkillDefinition<
  RequestDocPackInput,
  RequestDocPackOutput
> = {
  name: "request_doc_pack",
  description: "Generate a doc packet plan (no execution).",
  inputSchema: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", description: "Document title." },
      sections: { type: "array", description: "Optional sections." },
      format: { type: "string", description: "md or txt." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "request_doc_pack",
    target: () => "data/memory/artifacts"
  },
  handler: (input, context) => {
    const sections = Array.isArray(input.sections) ? input.sections : [];
    const format = input.format ?? "md";
    const redaction = redactSensitiveText(input.title, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const plan = {
      title: redaction.redactedText,
      format,
      sections,
      outline: sections.map((section) => `Section: ${section}`)
    };
    const artifactPayload = {
      type: "doc_pack",
      plan,
      risks: ["Human review required before publishing."],
      estimated_cost: 0
    };
    const artifactJson = JSON.stringify(artifactPayload, null, 2);
    const id = crypto.createHash("sha256").update(artifactJson).digest("hex").slice(0, 12);
    const targetDir = path.join(context.config.rootDir, "data", "memory", "artifacts");
    assertAllowlistedPath(
      targetDir,
      context.config.permissions.writeAllowlist,
      context.config.rootDir
    );
    const { filePath } = writeMemoryEntry(context.config.rootDir, "artifacts", {
      id,
      title: `doc_pack_${redaction.redactedText}`,
      content: artifactJson,
      tags: ["doc_pack"]
    });
    return {
      artifactId: id,
      artifactPath: filePath,
      plan,
      risks: artifactPayload.risks,
      estimated_cost: 0
    };
  }
};
