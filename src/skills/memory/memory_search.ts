import type { SkillDefinition } from "../../types/skill";
import {
  assertAllowlistedPath,
  searchMemoryEntries
} from "../../core/memory_vault";

interface MemorySearchInput {
  bucket: "canon" | "notes" | "artifacts";
  query: string;
  maxResults?: number;
}

interface MemorySearchOutput {
  matches: Array<{ file: string; line: number; preview: string }>;
  truncated: boolean;
  filesSearched: number;
}

export const memorySearchSkill: SkillDefinition<
  MemorySearchInput,
  MemorySearchOutput
> = {
  name: "memory_search",
  description: "Search redacted memory entries in data/memory.",
  inputSchema: {
    type: "object",
    required: ["bucket", "query"],
    properties: {
      bucket: { type: "string", description: "canon, notes, or artifacts." },
      query: { type: "string", description: "Search query." },
      maxResults: { type: "number", description: "Maximum results." }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "memory_search",
    target: (input) => `data/memory/${input.bucket}`
  },
  handler: (input, context) => {
    if (!input.query || typeof input.query !== "string") {
      throw new Error("query is required.");
    }
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
    return searchMemoryEntries(context.config.rootDir, bucket, input.query, {
      maxResults: input.maxResults
    });
  }
};
