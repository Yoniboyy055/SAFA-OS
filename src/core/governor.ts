import type { ResolvedConfig } from "./config";
import type { ActionCategory, RiskLevel } from "../types/skill";

export interface GovernanceContext {
  actor: string;
  approved: boolean;
}

export interface GovernedAction {
  type: string;
  category: ActionCategory;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  allowWhenNetworkOff: boolean;
}

export interface GovernanceDecision {
  allowed: boolean;
  reason: string;
}

export class Governor {
  evaluate(
    action: GovernedAction,
    config: ResolvedConfig,
    context: GovernanceContext
  ): GovernanceDecision {
    // Handle kill switch first
    if (
      config.killSwitch.enabled &&
      (action.category === "network" ||
        action.category === "outbound_message" ||
        action.category === "external_tool")
    ) {
      return {
        allowed: false,
        reason: "Kill switch enabled for outbound actions."
      };
    }

    // Use switch to handle network category explicitly
    switch (action.category) {
      case "network":
        if (!config.network.enabled) {
          return {
            allowed: false,
            reason: "Network is disabled by default."
          };
        }
        break;
      case "local":
      case "outbound_message":
      case "external_tool":
        // Continue to general checks below
        break;
    }

    if (!action.allowWhenNetworkOff && !config.network.enabled) {
      return {
        allowed: false,
        reason: "Action not allowed when network is OFF."
      };
    }

    const approvalRequired =
      action.requiresApproval || action.riskLevel !== "LOW";
    if (approvalRequired && !context.approved) {
      return {
        allowed: false,
        reason: "Approval required for risky action."
      };
    }

    return {
      allowed: true,
      reason: "Allowed."
    };
  }
}
