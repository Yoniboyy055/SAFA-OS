import type { CompanionStatus } from "../types";

export function getMobileCompanionStatus(): CompanionStatus {
  return {
    channel: "mobile",
    connected: false,
    notes: "Mobile companion shell not implemented."
  };
}
