import type { SkillDefinition } from "../../types/skill";
import { searchMemory } from "../../core/memory_store";

interface QueryCanonInput {
  query: string;
  maxResults?: number;
}

interface QueryCanonOutput {
  matches: Array<{ file: string; line: number; preview: string }>;
  truncated: boolean;
  filesSearched: number;
}

export const queryCanonMemorySkill: SkillDefinition<
  QueryCanonInput,
  QueryCanonOutput
> = {
  name: "query_canon_memory",
  description: "Search canon memory entries.",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "Search query." },
      maxResults: { type: "number", description: "Maximum matches." }
    }
  },
  riskLevel: "LOW",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "query_canon_memory",
    target: () => "memory/canon"
  },
  handler: (input, context) => {
    if (!input.query || typeof input.query !== "string") {
      throw new Error("query is required.");
    }
    return searchMemory(context.config.rootDir, "canon", input.query, {
      maxResults: input.maxResults
    });
  }
};
