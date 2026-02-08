export interface SpatialCommandInput {
  source: "gaze" | "hand" | "voice" | "controller";
  commandText: string;
  metadata?: Record<string, unknown>;
  receivedAt: string;
}

let lastCommand: SpatialCommandInput | null = null;

export function recordSpatialCommand(input: SpatialCommandInput): void {
  lastCommand = { ...input };
}

export function getLastSpatialCommand(): SpatialCommandInput | null {
  return lastCommand ? { ...lastCommand } : null;
}
