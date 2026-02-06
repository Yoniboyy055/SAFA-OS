import * as fs from "node:fs";
import * as path from "node:path";

import type { ResolvedConfig } from "./config";

export interface PacketExecutionResult {
  status: "DENIED" | "NOT_IMPLEMENTED";
  message: string;
}

export function executePacket(
  packetPath: string,
  config: ResolvedConfig
): PacketExecutionResult {
  if (!config.execution.enabled) {
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
  const resolved = path.resolve(packetPath);
  const allowlist = config.execution.allowlistPaths;
  if (
    !allowlist.some((entry) => {
      const root = path.resolve(entry);
      return resolved === root || resolved.startsWith(root + path.sep);
    })
  ) {
    return {
      status: "DENIED",
      message: "Packet path is not allowlisted."
    };
  }
  return {
    status: "NOT_IMPLEMENTED",
    message: "Execution runner is scaffolded only; no execution in Phase 5 prep."
  };
}
