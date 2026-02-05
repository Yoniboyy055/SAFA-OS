import type { SkillDefinition } from "../types/skill";
import type { ResolvedConfig } from "../core/config";
import type { AuditLogger } from "../core/audit";
import type { Governor } from "../core/governor";

type ExecContext = {
  actor: string;
  approved: boolean;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
};

type ExecResult = {
  success: boolean;
  output?: unknown;
  error?: string;
};

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition<any, any>>();

  register<TIn, TOut>(skill: SkillDefinition<TIn, TOut>) {
    this.skills.set(skill.name, skill as SkillDefinition<any, any>);
  }

  get(name: string) {
    return this.skills.get(name);
  }

  list() {
    return Array.from(this.skills.values());
  }

  async execute(name: string, input: unknown, ctx: ExecContext): Promise<ExecResult> {
    const skill = this.get(name);
    if (!skill) {
      ctx.audit.log({
        timestamp: new Date().toISOString(),
        actor: ctx.actor,
        action: "run",
        approved: ctx.approved,
        target: name,
        result: "ERROR: Unknown skill."
      });
      return { success: false, error: `Unknown skill: ${name}` };
    }

    // Governor decision
    const decision = ctx.governor.evaluate(
      {
        type: "skill",
        category: skill.category,
        riskLevel: skill.riskLevel,
        requiresApproval: skill.requiresApproval,
        allowWhenNetworkOff: skill.allowWhenNetworkOff
      },
      ctx.config,
      { actor: ctx.actor, approved: ctx.approved }
    );

    if (!decision.allowed) {
      ctx.audit.log({
        timestamp: new Date().toISOString(),
        actor: ctx.actor,
        action: "run",
        approved: ctx.approved,
        target: name,
        result: `DENIED: ${decision.reason}`
      });
      return { success: false, error: decision.reason };
    }

    try {
      // Skill-level audit template (if provided)
      if (skill.auditTemplate) {
        ctx.audit.log({
          timestamp: new Date().toISOString(),
          actor: ctx.actor,
          action: skill.auditTemplate.action,
          approved: ctx.approved,
          target: skill.auditTemplate.target(input as any),
          result: "START"
        });
      } else {
        ctx.audit.log({
          timestamp: new Date().toISOString(),
          actor: ctx.actor,
          action: "run",
          approved: ctx.approved,
          target: name,
          result: "START"
        });
      }

      const output = await skill.handler(input as any, {
        actor: ctx.actor,
        approved: ctx.approved,
        config: ctx.config,
        audit: ctx.audit,
        governor: ctx.governor
      });

      ctx.audit.log({
        timestamp: new Date().toISOString(),
        actor: ctx.actor,
        action: "run",
        approved: ctx.approved,
        target: name,
        result: "SUCCESS"
      });

      return { success: true, output };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.audit.log({
        timestamp: new Date().toISOString(),
        actor: ctx.actor,
        action: "run",
        approved: ctx.approved,
        target: name,
        result: `ERROR: ${msg}`
      });
      return { success: false, error: msg };
    }
  }
}
