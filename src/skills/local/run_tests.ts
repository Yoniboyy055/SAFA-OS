import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";

interface RunTestsInput {
  command: string;
  timeoutMs?: number;
}

interface RunTestsOutput {
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdoutPreview: string;
  stderrPreview: string;
  stdoutHash: string;
  stderrHash: string;
}

const ALLOWED_COMMANDS = new Set(["npm test", "npm run build"]);
const DEFAULT_TIMEOUT_MS = 600_000;
const MAX_BUFFER_BYTES = 1_024 * 1_024;
const PREVIEW_LIMIT = 2_000;

function truncatePreview(text: string): string {
  if (text.length <= PREVIEW_LIMIT) {
    return text;
  }
  return `${text.slice(0, PREVIEW_LIMIT)}...[TRUNCATED]`;
}

function hashOutput(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function parseCommand(command: string): { cmd: string; args: string[] } {
  const parts = command.trim().split(/\s+/);
  return { cmd: parts[0], args: parts.slice(1) };
}

export const runTestsSkill: SkillDefinition<RunTestsInput, RunTestsOutput> = {
  name: "run_tests",
  description: "Run local test commands in a controlled manner.",
  inputSchema: {
    type: "object",
    required: ["command"],
    properties: {
      command: {
        type: "string",
        description: "Allowed commands: npm test, npm run build."
      },
      timeoutMs: {
        type: "number",
        description: "Timeout in milliseconds (default 600000)."
      }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "external_tool",
  auditTemplate: {
    action: "run_tests",
    target: (input) => input.command
  },
  handler: (input, context) => {
    if (!input.command || typeof input.command !== "string") {
      throw new Error("Command is required.");
    }
    const command = input.command.trim();
    if (!ALLOWED_COMMANDS.has(command)) {
      throw new Error("Command is not allowlisted.");
    }

    const timeoutMs =
      typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
        ? input.timeoutMs
        : DEFAULT_TIMEOUT_MS;

    const { cmd, args } = parseCommand(command);
    const startTime = Date.now();
    const result = childProcess.spawnSync(cmd, args, {
      cwd: context.config.rootDir,
      shell: false,
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER_BYTES,
      encoding: "utf8"
    });
    const durationMs = Date.now() - startTime;

    if (result.error && result.status === null && !result.signal) {
      throw new Error(`Command failed to start: ${result.error.message}`);
    }

    const stdout = typeof result.stdout === "string" ? result.stdout : "";
    const stderr = typeof result.stderr === "string" ? result.stderr : "";

    return {
      exitCode: result.status,
      signal: result.signal ?? null,
      durationMs,
      stdoutPreview: truncatePreview(stdout),
      stderrPreview: truncatePreview(stderr),
      stdoutHash: hashOutput(stdout),
      stderrHash: hashOutput(stderr)
    };
  }
};
