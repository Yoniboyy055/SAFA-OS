#!/usr/bin/env node
import * as crypto from "node:crypto";
import * as fs from "node:fs";
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
import { readFreezeState } from "../core/freeze";
import { getLayerDefinitions } from "../core/layers";
import { readVrState } from "../core/vr";
import { parseCommandMode } from "./command_mode";
import { summarizeSAFALine } from "./safa_line";
import { buildRegistry } from "../skills/registry_factory";
import {
  createApprovalRequest,
  approveRequest,
  denyRequest,
  type ApprovalRequest
} from "../core/approvals";
import { ApprovalStore } from "../core/approval_store";
import { ExecutionStore } from "../core/execution_store";
import { createPacket, loadPacket } from "../core/packet";
import {
  openNetworkWindow,
  closeNetworkWindow,
  loadNetworkWindow
} from "../core/network_window";
import { VoiceLogStore } from "../core/voice/voice_store";
import { parseVoiceTranscript } from "../core/voice/voice_parser";
import { verifyConstitutionOrExit } from "../core/constitution";
import { enterCommandContext } from "../core/execution_gate";

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

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeJson(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hashPayload(value: unknown): string {
  return hashValue(safeJson(value ?? {}));
}

function findApprovedApproval(
  store: ApprovalStore,
  action: string,
  payloadHash: string
): ApprovalRequest | undefined {
  return store
    .list()
    .find((entry) => entry.status === "APPROVED" && entry.action === action && entry.payloadHash === payloadHash);
}

function printUsage(): void {
  console.log(`SAFA OS (Governed) - Phase 0 CLI

Usage:
  safa skills [--config <path>] [--actor <name>]
  safa status [--config <path>] [--actor <name>]
  safa line [--text "<SAFA: ...>"] [--config <path>] [--actor <name>]
  safa approvals <list|show|approve|deny> [args...]
  safa audit tail --n 50
  safa packet <create|apply> [args...]
  safa plan "<task>" [--config <path>] [--actor <name>]
  safa exec "<task>" [--approve] [--config <path>] [--actor <name>]
  safa payment:preview --input <json> [--config <path>] [--actor <name>]
  safa payment:request --approve --input <json> [--config <path>] [--actor <name>]
  safa email:preview --input <json> [--config <path>] [--actor <name>]
  safa email:send --approve --input <json> [--config <path>] [--actor <name>]
  safa call:preview --input <json> [--config <path>] [--actor <name>]
  safa call:make --approve --input <json> [--config <path>] [--actor <name>]
  safa net:preview --method GET --url https://example.com --purpose "..." [--body "..."] [--approve] [--config <path>] [--actor <name>]
  safa net:open --hours <6|8> --mode SCRIPT --authority OWNER --approve
  safa net:close --mode SCRIPT --authority OWNER --approve
  safa net:status
  safa voice:parse --text "<transcript>" [--execute --approve]
  safa voice:replay [--n 20]
  safa run <skill> --input <json> --mode SCRIPT --authority OWNER [--approve]
  safa <command> --mode <CREATE|BUILD|DECIDE|CLARIFY|SCRIPT> --authority OWNER
  safa help

Notes:
  - Use "safa skills" to list available skills.
  - --approve is required for risky actions.
  - Network stays OFF by default.
`);
}

async function readStdinLine(): Promise<string> {
  return new Promise((resolve) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.includes("\n")) {
        resolve(buffer.split("\n")[0]);
      }
    });
    process.stdin.on("end", () => resolve(buffer.trim()));
  });
}

export async function runWithArgs(
  args: string[],
  options?: { exit?: (code: number) => void }
): Promise<void> {
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

  enterCommandContext({
    id: `cli-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    actor,
    source: "cli",
    command
  });

  verifyConstitutionOrExit(actor);

  const config = loadConfig(configPath);
  const freezeState = readFreezeState(config.rootDir);
  const audit = new AuditLogger({
    logPath: config.audit.logPath,
    redactKeys: config.audit.redactKeys
  });
  const governor = new Governor();
  const registry = buildRegistry();

  const originalExit = process.exit;
  if (options?.exit) {
    (process as { exit: (code?: number) => never }).exit = (code?: number) => {
      options.exit?.(code ?? 0);
      throw new Error(`__EXIT__:${code ?? 0}`);
    };
  }

  try {

  // registry built via factory

  const requiresMode = [
    "exec",
    "run",
    "net:preview",
    "net:open",
    "net:close",
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

  if (command === "line") {
    const textFlag = getFlagValue(args, "--text");
    const line = textFlag ?? (await readStdinLine());
    if (!line) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "safa_line",
        approved,
        target: "line",
        result: "ERROR: Missing input."
      });
      console.error("SAFA line text is required.");
      process.exit(1);
      return;
    }
    let parsed;
    try {
      parsed = summarizeSAFALine(line);
    } catch (error) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "safa_line",
        approved,
        target: "line",
        result: `ERROR: ${error instanceof Error ? error.message : String(error)}`
      });
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
      return;
    }

    const parsedConfigPath = getFlagValue(parsed.argv, "--config") ?? configPath;
    const parsedActor = getFlagValue(parsed.argv, "--actor") ?? actor;
    const lineConfig = loadConfig(parsedConfigPath);
    const lineAudit = new AuditLogger({
      logPath: lineConfig.audit.logPath,
      redactKeys: lineConfig.audit.redactKeys
    });

    lineAudit.log({
      timestamp: new Date().toISOString(),
      actor: parsedActor,
      action: "safa_line",
      approved: parsed.argv.includes("--approve"),
      target: parsed.command,
      result: JSON.stringify({
        input_redacted: true,
        inputHash: parsed.inputHash
      })
    });

    if (parsed.argv[0] === "run" && !parsed.argv.includes("--approve")) {
      const store = new ApprovalStore(lineConfig.rootDir);
      const skill = parsed.argv[1] ?? "unknown";
      const inputRaw = getFlagValue(parsed.argv, "--input");
      let payload: Record<string, unknown> | undefined;
      if (inputRaw) {
        try {
          const parsedInput = JSON.parse(inputRaw);
          if (parsedInput && typeof parsedInput === "object") {
            payload = parsedInput as Record<string, unknown>;
          }
        } catch {
          payload = undefined;
        }
      }
      const approvalPayload = { input: payload ?? null, skill };
      const approvalRequest = createApprovalRequest(
        {
          action: `run:${skill}`,
          target: skill,
          payload: approvalPayload
        },
        { actor: parsedActor, audit: lineAudit }
      );
      store.upsert(approvalRequest);
      console.error("Approval required. Request created.");
      process.exit(1);
      return;
    }

    await runWithArgs(parsed.argv, options);
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

  if (command === "status") {
    const vrState = readVrState(config.rootDir);
    const status = {
      networkEnabled: config.network.enabled,
      killSwitchEnabled: config.killSwitch.enabled,
      strictApprovalMode: config.governance.strictApprovalMode,
      freezeEnabled: freezeState.enabled,
      vrEnabled: vrState.enabled,
      vrArmed: vrState.armed,
      phase: "7A",
      phase7b: "LOCKED",
      phase7c: "PLANNED",
      layers: getLayerDefinitions(),
      configPath: config.configPath
    };
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "status",
      approved,
      target: "system",
      result: "SUCCESS"
    });
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (command === "audit") {
    const sub = args[1];
    if (sub !== "tail") {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "audit",
        approved,
        target: sub ?? "unknown",
        result: "ERROR: Unknown audit command."
      });
      console.error("audit tail is the only supported command.");
      process.exit(1);
      return;
    }
    const countRaw = getFlagValue(args, "--n") ?? "50";
    const count = Number.parseInt(countRaw, 10);
    const lines = fs.existsSync(config.audit.logPath)
      ? fs.readFileSync(config.audit.logPath, "utf8").trim().split("\n")
      : [];
    const tail = lines.slice(Math.max(0, lines.length - (Number.isNaN(count) ? 50 : count)));
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "audit.tail",
      approved,
      target: config.audit.logPath,
      result: "SUCCESS"
    });
    console.log(tail.join("\n"));
    return;
  }

  if (command === "approvals") {
    const sub = args[1];
    const store = new ApprovalStore(config.rootDir);
    if (sub === "list") {
      const approvals = store.list();
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "approvals.list",
        approved,
        target: "approvals",
        result: "SUCCESS"
      });
      console.log(JSON.stringify(approvals, null, 2));
      return;
    }
    if (sub === "show") {
      const id = args[2];
      if (!id) {
        console.error("Approval id is required.");
        process.exit(1);
        return;
      }
      const approval = store.get(id);
      if (!approval) {
        console.error("Approval not found.");
        process.exit(1);
        return;
      }
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "approvals.show",
        approved,
        target: id,
        result: "SUCCESS"
      });
      console.log(JSON.stringify(approval, null, 2));
      return;
    }
    if (sub === "approve") {
      const id = args[2];
      if (!id) {
        console.error("Approval id is required.");
        process.exit(1);
        return;
      }
      const approval = store.get(id);
      if (!approval) {
        console.error("Approval not found.");
        process.exit(1);
        return;
      }
      const updated = approveRequest(approval, { actor, audit });
      store.upsert(updated);
      console.log(JSON.stringify(updated, null, 2));
      return;
    }
    if (sub === "deny") {
      const id = args[2];
      if (!id) {
        console.error("Approval id is required.");
        process.exit(1);
        return;
      }
      const approval = store.get(id);
      if (!approval) {
        console.error("Approval not found.");
        process.exit(1);
        return;
      }
      const reason = getFlagValue(args, "--reason") ?? "Denied.";
      const updated = denyRequest(approval, { actor, audit }, reason);
      store.upsert(updated);
      console.log(JSON.stringify(updated, null, 2));
      return;
    }
    console.error("Unknown approvals command.");
    process.exit(1);
    return;
  }

  if (command === "packet") {
    const sub = args[1];
    if (sub === "create") {
      const mode = getFlagValue(args, "--mode");
      const payloadRaw = getFlagValue(args, "--payload");
      let payload: Record<string, unknown> | undefined;
      if (payloadRaw) {
        try {
          payload = JSON.parse(payloadRaw) as Record<string, unknown>;
        } catch (error) {
          console.error(`Invalid payload JSON: ${String(error)}`);
          process.exit(1);
          return;
        }
      }
      const safaLine =
        payload && typeof payload.safaLine === "string"
          ? String(payload.safaLine)
          : undefined;
      const packet = createPacket(config.rootDir, {
        mode: mode ?? undefined,
        payload,
        safaLine
      });
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "packet.create",
        approved,
        target: packet.id,
        result: "SUCCESS"
      });
      console.log(JSON.stringify(packet, null, 2));
      return;
    }
    if (sub === "apply") {
      const id = args[2];
      if (!id) {
        console.error("Packet id is required.");
        process.exit(1);
        return;
      }
      const packet = loadPacket(config.rootDir, id);
      if (packet.safaLine) {
        const parsed = summarizeSAFALine(packet.safaLine);
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "packet.apply",
          approved,
          target: id,
          result: JSON.stringify({ input_redacted: true, inputHash: parsed.inputHash })
        });
        await runWithArgs(parsed.argv, options);
        return;
      }
      if (packet.mode === "RUN" && packet.payload) {
        const payload = packet.payload;
        const skill = typeof payload.skill === "string" ? payload.skill : undefined;
        const input = payload.input && typeof payload.input === "object" ? payload.input : {};
        if (!skill) {
          console.error("Packet RUN payload missing skill.");
          process.exit(1);
          return;
        }
        const argv = ["run", skill, "--input", JSON.stringify(input), "--mode", "SCRIPT", "--authority", "OWNER"];
        await runWithArgs(argv, options);
        return;
      }
      console.error("Unsupported packet format.");
      process.exit(1);
      return;
    }
    console.error("Unknown packet command.");
    process.exit(1);
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
    const planHash = hashPayload(plan);
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "plan",
      approved,
      target: "task",
      result: "SUCCESS"
    });
    console.log(JSON.stringify({ plan, planHash }, null, 2));
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
    const planHash = hashPayload(plan);
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
      console.log(JSON.stringify({ plan, planHash }, null, 2));
      process.exit(1);
      return;
    }

    if (review.approvalRequired && !approved) {
      const store = new ApprovalStore(config.rootDir);
      const approvalRequest = createApprovalRequest(
        {
          action: "exec",
          target: planHash,
          plan,
          policy: { requirePlanHash: true }
        },
        { actor, audit }
      );
      store.upsert(approvalRequest);
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
    const executionStore = new ExecutionStore(config.rootDir);
    executionStore.append({
      id: `exec-${Date.now()}`,
      kind: "plan",
      actor,
      success: execution.success,
      createdAt: new Date().toISOString(),
      planHash,
      steps: execution.results.map((result) => ({
        stepId: result.stepId,
        skill: result.skill,
        success: result.success
      }))
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
      JSON.stringify({ plan, planHash, results: execution.results }, null, 2)
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
    const approvalPayload = { input, skill: skillName };
    const payloadHash = hashPayload(approvalPayload);
    let approvalRecord: ApprovalRequest | undefined;
    if (approved) {
      const store = new ApprovalStore(config.rootDir);
      approvalRecord = findApprovedApproval(store, `run:${skillName}`, payloadHash);
    }
    const result = await registry.execute(skillName, input, {
      actor,
      approved,
      authority: AuthorityLevel.OWNER,
      commandMode: commandMode ?? "SCRIPT",
      config,
      audit,
      governor,
      approval: approvalRecord,
      payloadHash,
      freezeEnabled: freezeState.enabled
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

    const approvalPayload = { url, method, purpose, body };
    const payloadHash = hashPayload(approvalPayload);
    let approvalRecord: ApprovalRequest | undefined;
    if (config.governance.networkApprovalMode === "plan_hash") {
      const store = new ApprovalStore(config.rootDir);
      if (approved) {
        approvalRecord = findApprovedApproval(store, "net:preview", payloadHash);
      }
      if (!approvalRecord) {
        const approvalRequest = createApprovalRequest(
          {
            action: "net:preview",
            target: url,
            payload: approvalPayload,
            policy: { requirePayloadHash: true }
          },
          { actor, audit }
        );
        store.upsert(approvalRequest);
        console.error("Approval required. Request created.");
        process.exit(1);
        return;
      }
    }

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
        freezeEnabled: freezeState.enabled,
        defenseText: body,
        maturityLevel: 5,
        freshOwnerInput: true,
        costEstimateUsd: 0,
        approval: approvalRecord,
        payloadHash
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
      governor,
      freezeEnabled: freezeState.enabled
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
      governor,
      freezeEnabled: freezeState.enabled
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
      governor,
      freezeEnabled: freezeState.enabled
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
      governor,
      freezeEnabled: freezeState.enabled
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
      governor,
      freezeEnabled: freezeState.enabled
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
      governor,
      freezeEnabled: freezeState.enabled
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

  if (command === "net:open") {
    if (!approved) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "net.open",
        approved,
        target: "network_window",
        result: "DENIED: Approval required."
      });
      console.error("Approval required. Re-run with --approve.");
      process.exit(1);
      return;
    }
    const hoursRaw = getFlagValue(args, "--hours");
    const hours = hoursRaw ? Number.parseInt(hoursRaw, 10) : 0;
    if (hours !== 6 && hours !== 8) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "net.open",
        approved,
        target: "network_window",
        result: "DENIED: --hours must be 6 or 8."
      });
      console.error("--hours must be 6 or 8.");
      process.exit(1);
      return;
    }
    const state = openNetworkWindow(config.rootDir, hours, actor);
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "net.open",
      approved,
      target: "network_window",
      result: JSON.stringify({ startAt: state.startAt, endAt: state.endAt })
    });
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (command === "net:close") {
    if (!approved) {
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "net.close",
        approved,
        target: "network_window",
        result: "DENIED: Approval required."
      });
      console.error("Approval required. Re-run with --approve.");
      process.exit(1);
      return;
    }
    const state = closeNetworkWindow(config.rootDir, actor);
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "net.close",
      approved,
      target: "network_window",
      result: "Network window closed."
    });
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (command === "net:status") {
    const state = loadNetworkWindow(config.rootDir);
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "net.status",
      approved,
      target: "network_window",
      result: JSON.stringify(state)
    });
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (command === "voice:parse") {
    const transcript = getFlagValue(args, "--text") ?? (await readStdinLine());
    if (!transcript || !transcript.trim()) {
      console.error("Voice transcript is required.");
      process.exit(1);
      return;
    }
    const parsed = parseVoiceTranscript(transcript);
    const voiceStore = new VoiceLogStore(config.rootDir);
    voiceStore.append({
      id: `voice-${Date.now()}`,
      actor,
      transcript,
      parsed,
      createdAt: new Date().toISOString()
    });
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "voice.parse",
      approved,
      target: "voice",
      result: JSON.stringify({ intent: parsed.intent, confidence: parsed.confidence })
    });
    console.log(JSON.stringify(parsed, null, 2));
    if (hasFlag(args, "--execute")) {
      if (!approved) {
        console.error("Approval required. Re-run with --approve to execute.");
        process.exit(1);
        return;
      }
      const planArgs = ["plan", parsed.commandText, "--mode", "CLARIFY", "--authority", "OWNER"];
      await runWithArgs(planArgs, options);
    }
    return;
  }

  if (command === "voice:replay") {
    const countRaw = getFlagValue(args, "--n") ?? "20";
    const count = Number.parseInt(countRaw, 10);
    const voiceStore = new VoiceLogStore(config.rootDir);
    const entries = voiceStore.list(Number.isNaN(count) ? 20 : count);
    console.log(JSON.stringify(entries, null, 2));
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
  } finally {
    if (options?.exit) {
      process.exit = originalExit;
    }
  }
}

async function main(): Promise<void> {
  await runWithArgs(process.argv.slice(2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Fatal error: ${String(error)}`);
    process.exit(1);
  });
}
