import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import {
  assertAllowlistedPath,
  writeMemoryEntry
} from "../../core/memory_vault";

interface MemoryAddInput {
  bucket: "canon" | "notes";
  title: string;
  content: string;
  tags?: string[];
}

interface MemoryAddOutput {
  id: string;
  file: string;
  redacted: boolean;
  findings: string[];
}

export const memoryAddSkill: SkillDefinition<MemoryAddInput, MemoryAddOutput> =
  {
    name: "memory_add",
    description: "Write a redacted memory entry to data/memory.",
    inputSchema: {
      type: "object",
      required: ["bucket", "title", "content"],
      properties: {
        bucket: { type: "string", description: "canon or notes." },
        title: { type: "string", description: "Entry title." },
        content: { type: "string", description: "Entry content." },
        tags: { type: "array", description: "Optional tags." }
      }
    },
    riskLevel: "HIGH",
    requiresApproval: true,
    allowWhenNetworkOff: true,
    category: "local",
    auditTemplate: {
      action: "memory_add",
      target: (input) => `data/memory/${input.bucket}`
    },
    handler: (input, context) => {
      if (!input.content || typeof input.content !== "string") {
        throw new Error("content is required.");
      }
      if (input.bucket !== "canon" && input.bucket !== "notes") {
        throw new Error("bucket must be canon or notes.");
      }
      const redaction = redactSensitiveText(input.content, {
        allowPii: false,
        redactKeys: context.config.audit.redactKeys
      });
      const targetDir = path.join(
        context.config.rootDir,
        "data",
        "memory",
        input.bucket
      );
      assertAllowlistedPath(
        targetDir,
        context.config.permissions.writeAllowlist,
        context.config.rootDir
      );
      const approvedAt = context.approval?.resolvedAt ?? new Date().toISOString();
      const { id, filePath } = writeMemoryEntry(context.config.rootDir, input.bucket, {
        title: input.title,
        content: redaction.redactedText,
        tags: Array.isArray(input.tags) ? input.tags : [],
        approvedBy: context.approval?.resolvedBy ?? context.actor,
        approvedAt,
        approvalId: context.approval?.id
      });
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "memory.write",
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
