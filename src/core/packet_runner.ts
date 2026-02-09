import * as fs from "node:fs";
import * as path from "node:path";

import type { ResolvedConfig } from "./config";
import type { SkillExecutionContext } from "../types/skill";
import { buildRegistry } from "../skills/registry_factory";
import { parseSAFALine } from "../cli/safa_line";

export interface PacketExecutionResult {
  status: "DENIED" | "ERROR" | "SUCCESS";
  message: string;
}

interface PacketPayload {
  skill?: string;
  input?: Record<string, unknown>;
  safaLine?: string;
}

interface PacketFile {
  id?: string;
  mode?: string;
  payload?: PacketPayload;
  safaLine?: string;
}

function isAllowlistedPath(packetPath: string, config: ResolvedConfig): boolean {
  const resolved = path.resolve(packetPath);
  const allowlist = config.execution.allowlistPaths;
  return allowlist.some((entry) => {
    const root = path.resolve(entry);
    return resolved === root || resolved.startsWith(root + path.sep);
  });
}

function parseRunPayloadFromArgv(argv: string[]): PacketPayload | undefined {
  if (!argv.length || argv[0] !== "run") {
    return undefined;
  }
  const skill = argv[1];
  if (!skill) {
    return undefined;
  }
  const inputIndex = argv.indexOf("--input");
  let input: Record<string, unknown> = {};
  if (inputIndex !== -1 && inputIndex + 1 < argv.length) {
    try {
      input = JSON.parse(argv[inputIndex + 1]) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return { skill, input };
}

export async function executePacket(
  packetPath: string,
  context: SkillExecutionContext
): Promise<PacketExecutionResult> {
  if (!context.config.execution.enabled) {
    return {
      status: "DENIED",
      message: "Execution is disabled by default."
    };
  }
  if (!fs.existsSync(packetPath)) {
    return {
      status: "DENIED",
      message: "Packet not found."
    };
  }
  if (!isAllowlistedPath(packetPath, context.config)) {
    return {
      status: "DENIED",
      message: "Packet path is not allowlisted."
    };
  }

  let packet: PacketFile;
  try {
    const raw = fs.readFileSync(packetPath, "utf8");
    packet = JSON.parse(raw) as PacketFile;
  } catch (error) {
    return {
      status: "ERROR",
      message: `Failed to read packet: ${String(error)}`
    };
  }

  let payload = packet.payload;
  if (!payload && typeof packet.safaLine === "string") {
    try {
      const argv = parseSAFALine(packet.safaLine);
      payload = parseRunPayloadFromArgv(argv);
    } catch {
      payload = undefined;
    }
  }
  if (payload?.safaLine && !payload.skill && typeof payload.safaLine === "string") {
    try {
      const argv = parseSAFALine(payload.safaLine);
      payload = parseRunPayloadFromArgv(argv);
    } catch {
      payload = undefined;
    }
  }

  if (!payload?.skill) {
    return {
      status: "DENIED",
      message: "Packet payload missing executable skill."
    };
  }

  const registry = buildRegistry();
  const result = await registry.execute(payload.skill, payload.input ?? {}, {
    actor: context.actor,
    approved: context.approved,
    authority: context.authority,
    commandMode: context.commandMode,
    config: context.config,
    audit: context.audit,
    governor: context.governor,
    approval: context.approval,
    freezeEnabled: context.freezeEnabled
  });

  if (!result.success) {
    return {
      status: "ERROR",
      message: result.error ?? "Packet execution failed."
    };
  }

  return {
    status: "SUCCESS",
    message: `Packet executed skill ${payload.skill}.`
  };
}
