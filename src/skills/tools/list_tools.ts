import type { SkillDefinition } from "../../types/skill";
import { loadToolCatalog } from "../../core/tool_catalog";

interface ListToolsInput {}

interface ListToolsOutput {
  tools: Array<{
    name: string;
    description: string;
    category: string;
    risk: string;
    requiresApproval: boolean;
    networkRequired: boolean;
    costNotes: string;
    privacyNotes: string;
  }>;
}

export const listToolsSkill: SkillDefinition<ListToolsInput, ListToolsOutput> = {
  name: "list_tools",
  description: "List entries in the local tool catalog.",
  inputSchema: {
    type: "object",
    properties: {}
  },
  riskLevel: "LOW",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "list_tools",
    target: () => "tools/catalog"
  },
  handler: (_input, context) => {
    const catalog = loadToolCatalog(context.config.rootDir);
    return { tools: catalog.tools };
  }
};
