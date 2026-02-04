#!/usr/bin/env node
import { loadConfig } from "../core/config";
import { AuditLogger } from "../core/audit";
import { Governor } from "../core/governor";
import { Planner } from "../core/planner";
import { Manager } from "../core/manager";
import { Operator } from "../core/operator";
import { SkillRegistry } from "../skills/registry";
import { readFileSkill } from "../skills/local/read_file";
import { writeFileSkill } from "../skills/local/write_file";
import { listFilesSkill } from "../skills/local/list_files";
import { searchTextSkill } from "../skills/local/search_text";

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function printUsage(): void {
  console.log(`Jarvis OS (Governed) - Phase 0 CLI

Usage:
  jarvis skills [--config <path>] [--actor <name>]
  jarvis plan "<task>" [--config <path>] [--actor <name>]
  jarvis exec "<task>" [--approve] [--config <path>] [--actor <name>]
  jarvis run <skill> --input <json> [--approve] [--config <path>] [--actor <name>]
  jarvis help

Notes:
  - --approve is required for risky actions.
  - Network stays OFF by default.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";
  const configPath = getFlagValue(args, "--config");
  const actor = getFlagValue(args, "--actor") ?? "local-user";
  const approved = hasFlag(args, "--approve");

  const config = loadConfig(configPath);
  const audit = new AuditLogger({
    logPath: config.audit.logPath,
    redactKeys: config.audit.redactKeys
  });
  const governor = new Governor();
  const registry = new SkillRegistry();

  registry.register(readFileSkill);
  registry.register(writeFileSkill);
  registry.register(listFilesSkill);
  registry.register(searchTextSkill);

  if (command === "skills") {
    const skills = registry.list().map((skill) => ({
      name: skill.name,
      description: skill.description,
      riskLevel: skill.riskLevel,
      requiresApproval: skill.requiresApproval,
      allowWhenNetworkOff: skill.allowWhenNetworkOff
    }));
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "list_skills",
      approved,
      target: "registry",
      result: "SUCCESS"
    });
    console.log(JSON.stringify(skills, null, 2));
    return;
  }

  if (command === "plan") {
    const task = args[1];
    if (!task) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "plan",
        approved,
        target: "task",
        result: "ERROR: Missing task."
      });
      console.error("Task is required for planning.");
      process.exit(1);
      return;
    }
    const planner = new Planner();
    const plan = planner.createPlan(task);
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "plan",
      approved,
      target: "task",
      result: "SUCCESS"
    });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (command === "exec") {
    const task = args[1];
    if (!task) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "exec",
        approved,
        target: "task",
        result: "ERROR: Missing task."
      });
      console.error("Task is required to execute.");
      process.exit(1);
      return;
    }
    const planner = new Planner();
    const plan = planner.createPlan(task);
    const manager = new Manager(registry);
    const review = manager.reviewPlan(plan, config, approved);

    if (!review.valid) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "exec",
        approved,
        target: "task",
        result: `DENIED: ${review.reason ?? "Invalid plan."}`
      });
      console.error(review.reason ?? "Plan validation failed.");
      console.log(JSON.stringify(plan, null, 2));
      process.exit(1);
      return;
    }

    if (review.approvalRequired && !approved) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "exec",
        approved,
        target: "task",
        result: "DENIED: Approval required."
      });
      console.log(JSON.stringify(plan, null, 2));
      console.error("Approval required. Re-run with --approve to execute.");
      process.exit(1);
      return;
    }

    const operator = new Operator(registry, audit, governor);
    const execution = await operator.executePlan(review, {
      actor,
      approved,
      config
    });
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "exec",
      approved,
      target: "task",
      result: execution.success ? "SUCCESS" : "ERROR: Execution failed."
    });
    console.log(
      JSON.stringify({ plan, results: execution.results }, null, 2)
    );
    if (!execution.success) {
      process.exit(1);
    }
    return;
  }

  if (command === "run") {
    const skillName = args[1];
    if (!skillName) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "run",
        approved,
        target: "unknown",
        result: "ERROR: Missing skill name."
      });
      console.error("Skill name is required.");
      process.exit(1);
      return;
    }

    const inputRaw = getFlagValue(args, "--input");
    let input: unknown = {};
    if (inputRaw) {
      try {
        input = JSON.parse(inputRaw);
      } catch (error) {
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "run",
          approved,
          target: skillName,
          result: "ERROR: Invalid JSON input."
        });
        console.error(`Invalid JSON input: ${String(error)}`);
        process.exit(1);
        return;
      }
    }

    const result = await registry.execute(skillName, input, {
      actor,
      approved,
      config,
      audit,
      governor
    });
    if (result.success) {
      if (typeof result.output === "string") {
        console.log(result.output);
      } else {
        console.log(JSON.stringify(result.output ?? null, null, 2));
      }
      return;
    }
    console.error(result.error ?? "Skill failed.");
    process.exit(1);
    return;
  }

  audit.log({
    timestamp: new Date().toISOString(),
    actor,
    action: "cli_help",
    approved,
    target: command,
    result: command === "help" ? "SUCCESS" : "DENIED: Unknown command."
  });
  printUsage();
  if (command !== "help") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${String(error)}`);
  process.exit(1);
});
