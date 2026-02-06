#!/usr/bin/env node
import { loadConfig } from "../core/config";
import { AuditLogger } from "../core/audit";
import { Governor } from "../core/governor";
import { Planner } from "../core/planner";
import { Manager } from "../core/manager";
import { Operator } from "../core/operator";
import { validatePayloadSize, validateUrl } from "../core/network/types";
import { buildNetworkPolicy, validateMethod } from "../core/network/policy";
import { AuthorityLevel } from "../core/authority";
import { assertSafeInput } from "../core/defense";
import { parseCommandMode } from "./command_mode";
import { SkillRegistry } from "../skills/registry";
import { readFileSkill } from "../skills/local/read_file";
import { writeFileSkill } from "../skills/local/write_file";
import { listFilesSkill } from "../skills/local/list_files";
import { searchTextSkill } from "../skills/local/search_text";
import { runTestsSkill } from "../skills/local/run_tests";
import { sendEmailSkill } from "../skills/outbound/send_email";
import { sendHttpRequestSkill } from "../skills/network/send_http_request";
import { sendEmailRequestSkill } from "../skills/outbound/send_email_request";
import { requestPhoneCallSkill } from "../skills/outbound/request_phone_call";
import { requestPaymentSkill } from "../skills/outbound/request_payment";
import { makeCallSkill } from "../skills/outbound/make_call";

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
  jarvis payment:preview --input <json> [--config <path>] [--actor <name>]
  jarvis payment:request --approve --input <json> [--config <path>] [--actor <name>]
  jarvis email:preview --input <json> [--config <path>] [--actor <name>]
  jarvis email:send --approve --input <json> [--config <path>] [--actor <name>]
  jarvis call:preview --input <json> [--config <path>] [--actor <name>]
  jarvis call:make --approve --input <json> [--config <path>] [--actor <name>]
  jarvis net:preview --method GET --url https://example.com --purpose "..." [--body "..."] [--approve] [--config <path>] [--actor <name>]
  jarvis run <skill> --input <json> [--approve] [--config <path>] [--actor <name>]
  jarvis <command> --mode <CREATE|BUILD|DECIDE|CLARIFY|SCRIPT> --authority OWNER
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
  const modeFlag = getFlagValue(args, "--mode");
  const commandMode = parseCommandMode(modeFlag);
  const authorityFlag = getFlagValue(args, "--authority");
  const authority =
    authorityFlag && authorityFlag.toUpperCase() === AuthorityLevel.OWNER
      ? AuthorityLevel.OWNER
      : undefined;

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
  registry.register(runTestsSkill);
  registry.register(sendEmailSkill);
  registry.register(requestPaymentSkill);
  registry.register(makeCallSkill);
  registry.register(sendHttpRequestSkill);
  registry.register(sendEmailRequestSkill);
  registry.register(requestPhoneCallSkill);

  const requiresMode = [
    "exec",
    "run",
    "net:preview",
    "payment:preview",
    "payment:request",
    "email:preview",
    "email:send",
    "call:preview",
    "call:make"
  ].includes(command);

  if (requiresMode && !commandMode) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "AUTHORITY_VIOLATION",
      approved,
      target: command,
      result: "Command mode is required."
    });
    console.error("Command mode is required via --mode.");
    process.exit(1);
    return;
  }

  if (requiresMode && authority !== AuthorityLevel.OWNER) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "AUTHORITY_VIOLATION",
      approved,
      target: command,
      result: "Owner authority is required."
    });
    console.error("Owner authority is required via --authority OWNER.");
    process.exit(1);
    return;
  }

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
    assertSafeInput(task, audit, actor);
    const planner = new Planner();
    const plan = planner.createPlan(task, {
      actor,
      audit,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "CLARIFY"
    });
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
      config,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "SCRIPT"
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

    assertSafeInput(inputRaw ?? "", audit, actor);
    const result = await registry.execute(skillName, input, {
      actor,
      approved,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "SCRIPT",
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

  if (command === "net:preview") {
    const method = getFlagValue(args, "--method") ?? "GET";
    const url = getFlagValue(args, "--url");
    const purpose = getFlagValue(args, "--purpose") ?? "unspecified";
    const body = getFlagValue(args, "--body") ?? "";

    if (!url) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "net.preview",
        approved,
        target: "network",
        result: "ERROR: Missing URL."
      });
      console.error("URL is required.");
      process.exit(1);
      return;
    }

    const policy = buildNetworkPolicy(config);
    const methodDecision = validateMethod(method, policy);
    const urlDecision = validateUrl(url, {
      allowlistDomains: config.network.allowlistDomains,
      allowlistUrls: config.network.allowlistUrls,
      allowHttp: false,
      maxPayloadBytes: config.governance.maxNetworkPayloadBytes
    });
    const payloadDecision = validatePayloadSize(
      body,
      config.governance.maxNetworkPayloadBytes
    );

    const governorDecision = governor.evaluate(
      {
        type: "network_preview",
        category: "network",
        riskLevel: "MEDIUM",
        requiresApproval: true,
        allowWhenNetworkOff: false
      },
      config,
      {
        actor,
        approved,
        authority: AuthorityLevel.OWNER,
        commandMode: commandMode ?? "DECIDE",
        audit,
        defenseText: body,
        maturityLevel: 5,
        freshOwnerInput: true,
        costEstimateUsd: 0
      },
      {
        id: "preview",
        purpose,
        method,
        url,
        headers: {},
        bodySummary: body.slice(0, 256),
        bodyHash: "preview",
        riskLevel: "MEDIUM",
        requiresApproval: true
      }
    );

    const allowed =
      methodDecision.allowed &&
      urlDecision.allowed &&
      payloadDecision.allowed &&
      governorDecision.allowed;
    const reason =
      !methodDecision.allowed
        ? methodDecision.reason
        : !urlDecision.allowed
          ? urlDecision.reason
          : !payloadDecision.allowed
            ? payloadDecision.reason
            : governorDecision.reason;

    const preview = {
      allowed,
      reason,
      wouldLog: {
        url: urlDecision.normalizedUrl || url,
        domain: urlDecision.hostname || "",
        method,
        purpose,
        approved,
        bodySummary: body.slice(0, 256),
        bodyHash: "preview"
      }
    };

    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "net.preview",
      approved,
      target: url,
      result: allowed ? "SUCCESS" : `DENIED: ${reason}`
    });
    console.log(JSON.stringify(preview, null, 2));
    if (!allowed) {
      process.exit(1);
    }
    return;
  }

  if (command === "payment:preview") {
    const inputRaw = getFlagValue(args, "--input");
    if (!inputRaw) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "payment.preview",
        approved,
        target: "stripe",
        result: "ERROR: Missing input."
      });
      console.error("Input JSON is required.");
      process.exit(1);
      return;
    }
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(inputRaw) as Record<string, unknown>;
    } catch (error) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "payment.preview",
        approved,
        target: "stripe",
        result: "ERROR: Invalid JSON input."
      });
      console.error(`Invalid JSON input: ${String(error)}`);
      process.exit(1);
      return;
    }
    assertSafeInput(inputRaw, audit, actor);
    input.dryRun = true;
    const result = await registry.execute("request_payment", input, {
      actor,
      approved,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "DECIDE",
      config,
      audit,
      governor
    });
    if (!result.success) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "payment.preview",
        approved,
        target: "stripe",
        result: `DENIED: ${result.error ?? "Preview failed."}`
      });
      console.error(result.error ?? "Preview failed.");
      process.exit(1);
      return;
    }
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "payment.preview",
      approved,
      target: "stripe",
      result: "SUCCESS"
    });
    console.log(JSON.stringify(result.output ?? null, null, 2));
    return;
  }

  if (command === "payment:request") {
    if (!approved) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "payment.request",
        approved,
        target: "stripe",
        result: "DENIED: Approval required."
      });
      console.error("Approval required. Re-run with --approve to request.");
      process.exit(1);
      return;
    }
    const inputRaw = getFlagValue(args, "--input");
    if (!inputRaw) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "payment.request",
        approved,
        target: "stripe",
        result: "ERROR: Missing input."
      });
      console.error("Input JSON is required.");
      process.exit(1);
      return;
    }
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(inputRaw) as Record<string, unknown>;
    } catch (error) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "payment.request",
        approved,
        target: "stripe",
        result: "ERROR: Invalid JSON input."
      });
      console.error(`Invalid JSON input: ${String(error)}`);
      process.exit(1);
      return;
    }
    assertSafeInput(inputRaw, audit, actor);
    input.dryRun = false;
    const result = await registry.execute("request_payment", input, {
      actor,
      approved,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "DECIDE",
      config,
      audit,
      governor
    });
    if (!result.success) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "payment.request",
        approved,
        target: "stripe",
        result: `DENIED: ${result.error ?? "Request failed."}`
      });
      console.error(result.error ?? "Request failed.");
      process.exit(1);
      return;
    }
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "payment.request",
      approved,
      target: "stripe",
      result: "SUCCESS"
    });
    console.log(JSON.stringify(result.output ?? null, null, 2));
    return;
  }

  if (command === "email:preview") {
    const inputRaw = getFlagValue(args, "--input");
    if (!inputRaw) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "email.preview",
        approved,
        target: "email",
        result: "ERROR: Missing input."
      });
      console.error("Input JSON is required.");
      process.exit(1);
      return;
    }
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(inputRaw) as Record<string, unknown>;
    } catch (error) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "email.preview",
        approved,
        target: "email",
        result: "ERROR: Invalid JSON input."
      });
      console.error(`Invalid JSON input: ${String(error)}`);
      process.exit(1);
      return;
    }
    assertSafeInput(inputRaw, audit, actor);
    input.dryRun = true;
    const result = await registry.execute("send_email", input, {
      actor,
      approved,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "CREATE",
      config,
      audit,
      governor
    });
    if (!result.success) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "email.preview",
        approved,
        target: "email",
        result: `DENIED: ${result.error ?? "Preview failed."}`
      });
      console.error(result.error ?? "Preview failed.");
      process.exit(1);
      return;
    }
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "email.preview",
      approved,
      target: "email",
      result: "SUCCESS"
    });
    console.log(JSON.stringify(result.output ?? null, null, 2));
    return;
  }

  if (command === "email:send") {
    if (!approved) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "email.send",
        approved,
        target: "email",
        result: "DENIED: Approval required."
      });
      console.error("Approval required. Re-run with --approve to send.");
      process.exit(1);
      return;
    }
    const inputRaw = getFlagValue(args, "--input");
    if (!inputRaw) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "email.send",
        approved,
        target: "email",
        result: "ERROR: Missing input."
      });
      console.error("Input JSON is required.");
      process.exit(1);
      return;
    }
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(inputRaw) as Record<string, unknown>;
    } catch (error) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "email.send",
        approved,
        target: "email",
        result: "ERROR: Invalid JSON input."
      });
      console.error(`Invalid JSON input: ${String(error)}`);
      process.exit(1);
      return;
    }
    assertSafeInput(inputRaw, audit, actor);
    input.dryRun = false;
    const result = await registry.execute("send_email", input, {
      actor,
      approved,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "CREATE",
      config,
      audit,
      governor
    });
    if (!result.success) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "email.send",
        approved,
        target: "email",
        result: `DENIED: ${result.error ?? "Send failed."}`
      });
      console.error(result.error ?? "Send failed.");
      process.exit(1);
      return;
    }
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "email.send",
      approved,
      target: "email",
      result: "SUCCESS"
    });
    console.log(JSON.stringify(result.output ?? null, null, 2));
    return;
  }

  if (command === "call:preview") {
    const inputRaw = getFlagValue(args, "--input");
    if (!inputRaw) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "call.preview",
        approved,
        target: "calls",
        result: "ERROR: Missing input."
      });
      console.error("Input JSON is required.");
      process.exit(1);
      return;
    }
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(inputRaw) as Record<string, unknown>;
    } catch (error) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "call.preview",
        approved,
        target: "calls",
        result: "ERROR: Invalid JSON input."
      });
      console.error(`Invalid JSON input: ${String(error)}`);
      process.exit(1);
      return;
    }
    assertSafeInput(inputRaw, audit, actor);
    input.dryRun = true;
    const result = await registry.execute("make_call", input, {
      actor,
      approved,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "DECIDE",
      config,
      audit,
      governor
    });
    if (!result.success) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "call.preview",
        approved,
        target: "calls",
        result: `DENIED: ${result.error ?? "Preview failed."}`
      });
      console.error(result.error ?? "Preview failed.");
      process.exit(1);
      return;
    }
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "call.preview",
      approved,
      target: "calls",
      result: "SUCCESS"
    });
    console.log(JSON.stringify(result.output ?? null, null, 2));
    return;
  }

  if (command === "call:make") {
    if (!approved) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "call.make",
        approved,
        target: "calls",
        result: "DENIED: Approval required."
      });
      console.error("Approval required. Re-run with --approve to make call.");
      process.exit(1);
      return;
    }
    const inputRaw = getFlagValue(args, "--input");
    if (!inputRaw) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "call.make",
        approved,
        target: "calls",
        result: "ERROR: Missing input."
      });
      console.error("Input JSON is required.");
      process.exit(1);
      return;
    }
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(inputRaw) as Record<string, unknown>;
    } catch (error) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "call.make",
        approved,
        target: "calls",
        result: "ERROR: Invalid JSON input."
      });
      console.error(`Invalid JSON input: ${String(error)}`);
      process.exit(1);
      return;
    }
    assertSafeInput(inputRaw, audit, actor);
    input.dryRun = false;
    const result = await registry.execute("make_call", input, {
      actor,
      approved,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "DECIDE",
      config,
      audit,
      governor
    });
    if (!result.success) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "call.make",
        approved,
        target: "calls",
        result: `DENIED: ${result.error ?? "Call failed."}`
      });
      console.error(result.error ?? "Call failed.");
      process.exit(1);
      return;
    }
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "call.make",
      approved,
      target: "calls",
      result: "SUCCESS"
    });
    console.log(JSON.stringify(result.output ?? null, null, 2));
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
