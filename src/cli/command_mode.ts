export type CommandMode = "CREATE" | "BUILD" | "DECIDE" | "CLARIFY" | "SCRIPT";

const VALID_MODES: CommandMode[] = [
  "CREATE",
  "BUILD",
  "DECIDE",
  "CLARIFY",
  "SCRIPT"
];

export function parseCommandMode(value?: string): CommandMode | undefined {
  if (!value) {
    return undefined;
  }
  const upper = value.toUpperCase();
  return VALID_MODES.includes(upper as CommandMode)
    ? (upper as CommandMode)
    : undefined;
}

export function assertCommandMode(
  mode: CommandMode | undefined,
  audit: import("../core/audit").AuditLogger,
  actor: string
): CommandMode {
  if (!mode) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "AUTHORITY_VIOLATION",
      approved: false,
      target: "command_mode",
      result: "Command mode is required."
    });
    throw new Error("Command mode is required.");
  }
  return mode;
}
