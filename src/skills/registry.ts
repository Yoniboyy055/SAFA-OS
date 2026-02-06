import type { AuditLogger } from "../core/audit";
import type { Governor } from "../core/governor";
import type { ResolvedConfig } from "../core/config";
import type { AuthorityLevel } from "../core/authority";
import type { CommandMode } from "../cli/command_mode";
import type {
  SkillDefinition,
  SkillExecutionResult,
  SkillExecutionContext
} from "../types/skill";

export interface SkillRunContext {
  actor: string;
  approved: boolean;
  authority: AuthorityLevel;
  commandMode: CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  approval?: import("../core/approvals").ApprovalRequest;
  planHash?: string;
  payloadHash?: string;
}

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition<any, any>>();

  register(skill: SkillDefinition<any, any>): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill already registered: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
  }

  list(): SkillDefinition<any, any>[] {
    return Array.from(this.skills.values());
  }

  get(name: string): SkillDefinition<any, any> | undefined {
    return this.skills.get(name);
  }

  async execute(
    name: string,
    input: unknown,
    context: SkillRunContext
  ): Promise<SkillExecutionResult> {
    const skill = this.skills.get(name);
    if (!skill) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "skill.unknown",
        approved: context.approved,
        target: name,
        result: "DENIED: Unknown skill."
      });
      return {
        success: false,
        error: `Unknown skill: ${name}`
      };
    }

    const allowWhenNetworkOff =
      skill.allowWhenNetworkOff ||
      (["send_email", "request_payment", "make_call"].includes(skill.name) &&
        typeof input === "object" &&
        input !== null &&
        (input as { dryRun?: boolean }).dryRun === true);

    let decision;
    let networkRequest: import("../core/network/types").NetworkRequest | undefined;
    if (skill.category === "network" && input && typeof input === "object") {
      const payload = input as {
        url?: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        purpose?: string;
      };
      if (typeof payload.url === "string" && typeof payload.method === "string") {
        networkRequest = {
          id: `net-${Date.now()}`,
          purpose: payload.purpose ?? skill.name,
          method: payload.method,
          url: payload.url,
          headers: payload.headers ?? {},
          bodySummary: typeof payload.body === "string" ? payload.body : "",
          bodyHash: "",
          riskLevel: skill.riskLevel,
          requiresApproval: skill.requiresApproval
        };
      }
    }
    try {
      decision = context.governor.evaluate(
        {
          type: skill.name,
          category: skill.category,
          riskLevel: skill.riskLevel,
          requiresApproval: skill.requiresApproval,
          allowWhenNetworkOff
        },
        context.config,
        {
          actor: context.actor,
          approved: context.approved,
          authority: context.authority,
          commandMode: context.commandMode,
          audit: context.audit,
          defenseText:
            skill.name === "analyze_input_risk"
              ? ""
              : JSON.stringify(input ?? {}),
          maturityLevel: 5,
          freshOwnerInput: true,
          costEstimateUsd: 0,
          approval: context.approval,
          planHash: context.planHash,
          payloadHash: context.payloadHash
        },
        networkRequest
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message
      };
    }

    const target = skill.auditTemplate.target(input as never);
    if (!decision.allowed) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: skill.auditTemplate.action,
        approved: context.approved,
        target,
        result: `DENIED: ${decision.reason}`
      });
      return {
        success: false,
        error: decision.reason
      };
    }

    const skillContext: SkillExecutionContext = {
      config: context.config,
      actor: context.actor,
      approved: context.approved,
      authority: context.authority,
      commandMode: context.commandMode,
      audit: context.audit,
      governor: context.governor
    };

    try {
      const output = await skill.handler(input as never, skillContext);
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: skill.auditTemplate.action,
        approved: context.approved,
        target,
        result: "SUCCESS"
      });
      return {
        success: true,
        output
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: skill.auditTemplate.action,
        approved: context.approved,
        target,
        result: `ERROR: ${message}`
      });
      return {
        success: false,
        error: message
      };
    }
  }
}
