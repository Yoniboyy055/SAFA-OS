import type { ResolvedConfig } from "../core/config";
import type { AuditLogger } from "../core/audit";
import type { Governor } from "../core/governor";
import type { AuthorityLevel } from "../core/authority";
import type { CommandMode } from "../cli/command_mode";
import type { ApprovalRequest } from "../core/approvals";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ActionCategory = "local" | "network" | "outbound_message" | "external_tool";

export interface SkillInputSchema {
  type: "object";
  required?: string[];
  properties: Record<string, { type: string; description?: string }>;
}

export interface AuditTemplate<I> {
  action: string;
  target: (input: I) => string;
}

export interface SkillExecutionContext {
  actor: string;
  approved: boolean;
  authority: AuthorityLevel;
  commandMode: CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  approval?: ApprovalRequest;
  freezeEnabled?: boolean;
}

export interface SkillDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: SkillInputSchema;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  allowWhenNetworkOff: boolean;
  category: ActionCategory;
  auditTemplate: AuditTemplate<I>;
  handler: (input: I, context: SkillExecutionContext) => Promise<O> | O;
}

export interface SkillExecutionResult<O = unknown> {
  success: boolean;
  output?: O;
  error?: string;
}
