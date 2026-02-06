import type { SkillDefinition } from "../../types/skill";
import { loadToolCatalog, ToolCatalogEntry } from "../../core/tool_catalog";

interface RecommendToolInput {
  task: string;
  budgetCapUsd?: number;
  maxResults?: number;
}

interface RecommendToolOutput {
  task: string;
  budgetCapUsd?: number;
  recommendations: Array<{
    name: string;
    description: string;
    category: string;
    risk: string;
    requiresApproval: boolean;
    networkRequired: boolean;
    costNotes: string;
    privacyNotes: string;
    rationale: string;
  }>;
  note: string;
}

function scoreTool(entry: ToolCatalogEntry, terms: string[]): number {
  const haystack = `${entry.name} ${entry.description} ${entry.category}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) {
      score += 1;
    }
  }
  return score;
}

export const recommendToolSkill: SkillDefinition<
  RecommendToolInput,
  RecommendToolOutput
> = {
  name: "recommend_tool",
  description: "Recommend tools from the local catalog with tradeoffs.",
  inputSchema: {
    type: "object",
    required: ["task"],
    properties: {
      task: { type: "string", description: "Task description." },
      budgetCapUsd: { type: "number", description: "Budget cap (USD)." },
      maxResults: { type: "number", description: "Maximum recommendations." }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "recommend_tool",
    target: (input) => input.task
  },
  handler: (input, context) => {
    if (!input.task || typeof input.task !== "string") {
      throw new Error("task is required.");
    }
    const catalog = loadToolCatalog(context.config.rootDir);
    const terms = input.task
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 3);
    const scored = catalog.tools
      .map((tool) => ({
        tool,
        score: scoreTool(tool, terms)
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.tool.name.localeCompare(b.tool.name);
      });
    const maxResults = input.maxResults ?? 3;
    const recommendations = scored.slice(0, maxResults).map(({ tool, score }) => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      risk: tool.risk,
      requiresApproval: tool.requiresApproval,
      networkRequired: tool.networkRequired,
      costNotes: tool.costNotes,
      privacyNotes: tool.privacyNotes,
      rationale:
        score > 0
          ? `Matched ${score} task keywords.`
          : "Default recommendation due to limited keyword match."
    }));

    return {
      task: input.task,
      budgetCapUsd: input.budgetCapUsd,
      recommendations,
      note:
        "Recommendations are advisory only. No spending or switching occurs without explicit approval."
    };
  }
};
