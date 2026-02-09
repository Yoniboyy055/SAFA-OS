import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";
import { assertAllowlistedPath, deleteMemoryEntry } from "../../core/memory_vault";

interface MemoryDeleteInput {
  bucket: "canon" | "notes" | "artifacts";
  id: string;
}

interface MemoryDeleteOutput {
  id: string;
  bucket: string;
  file: string;
}

export const memoryDeleteSkill: SkillDefinition<
  MemoryDeleteInput,
  MemoryDeleteOutput
> = {
  name: "memory_delete",
  description: "Delete a memory entry from data/memory.",
  inputSchema: {
    type: "object",
    required: ["bucket", "id"],
    properties: {
      bucket: { type: "string", description: "canon, notes, or artifacts." },
      id: { type: "string", description: "Entry id." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "memory_delete",
    target: (input) => `data/memory/${input.bucket}`
  },
  handler: (input, context) => {
    if (!input.id || typeof input.id !== "string") {
      throw new Error("id is required.");
    }
    const bucket = input.bucket;
    if (bucket !== "canon" && bucket !== "notes" && bucket !== "artifacts") {
      throw new Error("bucket must be canon, notes, or artifacts.");
    }
    const targetDir = `${context.config.rootDir}/data/memory/${bucket}`;
    assertAllowlistedPath(
      targetDir,
      context.config.permissions.writeAllowlist,
      context.config.rootDir
    );
    const { filePath } = deleteMemoryEntry(context.config.rootDir, bucket, input.id);
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "memory.delete",
      approved: context.approved,
      target: path.relative(context.config.rootDir, filePath),
      result: "SUCCESS"
    });
    return {
      id: input.id,
      bucket,
      file: filePath
    };
  }
};
