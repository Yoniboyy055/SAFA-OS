import type { CompanionStatus } from "../types";

export function getDesktopCompanionStatus(): CompanionStatus {
  return {
    channel: "desktop",
    connected: false,
    notes: "Desktop companion shell not implemented."
  };
}
