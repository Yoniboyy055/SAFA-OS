import type { SkillDefinition } from "../../types/skill";
import { searchMemory } from "../../core/memory_store";
import { redactSensitiveText } from "../../core/sensitive";

interface SearchRawLogsInput {
  query: string;
  maxResults?: number;
  maxFileSizeBytes?: number;
}

interface SearchRawLogsOutput {
  matches: Array<{ file: string; line: number; preview: string }>;
  truncated: boolean;
  filesSearched: number;
}

export const searchRawLogsSkill: SkillDefinition<
  SearchRawLogsInput,
  SearchRawLogsOutput
> = {
  name: "search_raw_logs",
  description: "Search redacted raw memory logs (read-only).",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "Search query." },
      maxResults: { type: "number", description: "Maximum matches." },
      maxFileSizeBytes: {
        type: "number",
        description: "Skip files larger than this size."
      }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "search_raw_logs",
    target: () => "memory/raw"
  },
  handler: (input, context) => {
    if (!input.query || typeof input.query !== "string") {
      throw new Error("query is required.");
    }
    const results = searchMemory(context.config.rootDir, "raw", input.query, {
      maxResults: input.maxResults,
      maxFileSizeBytes: input.maxFileSizeBytes
    });
    const sanitized = results.matches.map((match) => {
      const redacted = redactSensitiveText(match.preview, { allowPii: false });
      return {
        ...match,
        preview: redacted.redactedText
      };
    });
    return { ...results, matches: sanitized };
  }
};
