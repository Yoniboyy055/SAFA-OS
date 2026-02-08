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
import { loadNetworkWindow } from "../core/network_window";
import {
  createReceiptId,
  hashInput,
  hashOutput,
  recordSkillReceipt,
  type SkillReceiptStatus
} from "../core/skill_receipt_store";

export interface SkillRunContext {
  actor: string;
  approved: boolean;
  authority: AuthorityLevel;
  commandMode: CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  freezeEnabled?: boolean;
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
    const createdAt = new Date().toISOString();
    const inputHash = hashInput(input);
    if (!skill) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "skill.unknown",
        approved: context.approved,
        target: name,
        result: "DENIED: Unknown skill."
      });
      recordSkillReceipt(context.config.rootDir, {
        id: createReceiptId(name, createdAt),
        skill: name,
        status: "DENIED",
        actor: context.actor,
        approved: context.approved,
        createdAt,
        inputHash,
        error: "Unknown skill."
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
    const allowWhenFrozen = ["freeze_system", "unfreeze_system"].includes(skill.name);

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
      const networkWindow = loadNetworkWindow(context.config.rootDir);
      decision = context.governor.evaluate(
        {
          type: skill.name,
          category: skill.category,
          riskLevel: skill.riskLevel,
          requiresApproval: skill.requiresApproval,
          allowWhenNetworkOff,
          allowWhenFrozen
        },
        context.config,
        {
          actor: context.actor,
          approved: context.approved,
          authority: context.authority,
          commandMode: context.commandMode,
          audit: context.audit,
          networkWindow,
          freezeEnabled: context.freezeEnabled,
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
      recordSkillReceipt(context.config.rootDir, {
        id: createReceiptId(skill.name, createdAt),
        skill: skill.name,
        status: "DENIED",
        actor: context.actor,
        approved: context.approved,
        createdAt,
        inputHash,
        error: decision.reason
      });
      return {
        success: false,
        error: decision.reason
      };
    }

    if (
      skill.category === "external_tool" &&
      context.config.execution.enabled &&
      context.config.execution.allowCommands.length > 0 &&
      !context.config.execution.allowCommands.includes(skill.name)
    ) {
      const reason = "Skill not allowlisted for execution.";
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: skill.auditTemplate.action,
        approved: context.approved,
        target,
        result: `DENIED: ${reason}`
      });
      recordSkillReceipt(context.config.rootDir, {
        id: createReceiptId(skill.name, createdAt),
        skill: skill.name,
        status: "DENIED",
        actor: context.actor,
        approved: context.approved,
        createdAt,
        inputHash,
        error: reason
      });
      return { success: false, error: reason };
    }

    const skillContext: SkillExecutionContext = {
      config: context.config,
      actor: context.actor,
      approved: context.approved,
      authority: context.authority,
      commandMode: context.commandMode,
      audit: context.audit,
      governor: context.governor,
      freezeEnabled: context.freezeEnabled
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
      recordSkillReceipt(context.config.rootDir, {
        id: createReceiptId(skill.name, createdAt),
        skill: skill.name,
        status: "SUCCESS",
        actor: context.actor,
        approved: context.approved,
        createdAt,
        inputHash,
        outputHash: hashOutput(output)
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
      recordSkillReceipt(context.config.rootDir, {
        id: createReceiptId(skill.name, createdAt),
        skill: skill.name,
        status: "ERROR",
        actor: context.actor,
        approved: context.approved,
        createdAt,
        inputHash,
        error: message
      });
      return {
        success: false,
        error: message
      };
    }
  }
}
