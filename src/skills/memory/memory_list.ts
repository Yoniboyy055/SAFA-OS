import type { SkillDefinition } from "../../types/skill";
import {
  assertAllowlistedPath,
  listMemoryEntries
} from "../../core/memory_vault";

interface MemoryListInput {
  bucket: "canon" | "notes" | "artifacts";
}

interface MemoryListOutput {
  entries: Array<{
    id: string;
    bucket: string;
    title: string;
    tags: string[];
    createdAt: string;
  }>;
}

export const memoryListSkill: SkillDefinition<
  MemoryListInput,
  MemoryListOutput
> = {
  name: "memory_list",
  description: "List memory entries in data/memory.",
  inputSchema: {
    type: "object",
    required: ["bucket"],
    properties: {
      bucket: { type: "string", description: "canon, notes, or artifacts." }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "memory_list",
    target: (input) => `data/memory/${input.bucket}`
  },
  handler: (input, context) => {
    const bucket = input.bucket;
    if (bucket !== "canon" && bucket !== "notes" && bucket !== "artifacts") {
      throw new Error("bucket must be canon, notes, or artifacts.");
    }
    const targetDir = `${context.config.rootDir}/data/memory/${bucket}`;
    assertAllowlistedPath(
      targetDir,
      context.config.permissions.readAllowlist,
      context.config.rootDir
    );
    const entries = listMemoryEntries(context.config.rootDir, bucket).map(
      (entry) => ({
        id: entry.id,
        bucket: entry.bucket,
        title: entry.title,
        tags: entry.tags,
        createdAt: entry.createdAt
      })
    );
    return { entries };
  }
};
