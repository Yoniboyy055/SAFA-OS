import type { ResolvedConfig } from "./config";
import type { ActionCategory, RiskLevel } from "../types/skill";
import type { NetworkRequest } from "./network/types";
import { validatePayloadSize, validateUrl } from "./network/types";

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
    context: GovernanceContext,
    networkRequest?: NetworkRequest
  ): GovernanceDecision {
    if (action.category === "network") {
      if (!networkRequest) {
        return {
          allowed: false,
          reason: "Network request details required for evaluation."
        };
      }
      return this.evaluateNetwork(networkRequest, config, context);
    }

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

    if (action.category === "network" && !config.network.enabled) {
      return {
        allowed: false,
        reason: "Network is disabled by default."
      };
    }

    if (!action.allowWhenNetworkOff && !config.network.enabled) {
      return {
        allowed: false,
        reason: "Action not allowed when network is OFF."
      };
    }

    if (config.governance.strictApprovalMode && !context.approved) {
      return {
        allowed: false,
        reason: "Strict approval mode requires explicit approval."
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

  evaluateNetwork(
    request: NetworkRequest,
    config: ResolvedConfig,
    context: GovernanceContext
  ): GovernanceDecision {
    if (config.killSwitch.enabled) {
      return {
        allowed: false,
        reason: "Kill switch enabled for outbound actions."
      };
    }

    if (!config.network.enabled) {
      return {
        allowed: false,
        reason: "Network is disabled by default."
      };
    }

    const urlDecision = validateUrl(request.url, {
      allowlistDomains: config.network.allowlistDomains,
      allowlistUrls: config.network.allowlistUrls,
      allowHttp: false,
      maxPayloadBytes: config.governance.maxNetworkPayloadBytes
    });
    if (!urlDecision.allowed) {
      return {
        allowed: false,
        reason: urlDecision.reason
      };
    }

    const payloadDecision = validatePayloadSize(
      request.bodySummary ?? "",
      config.governance.maxNetworkPayloadBytes
    );
    if (!payloadDecision.allowed) {
      return payloadDecision;
    }

    if (config.governance.strictApprovalMode && !context.approved) {
      return {
        allowed: false,
        reason: "Strict approval mode requires explicit approval."
      };
    }

    const approvalRequired =
      request.requiresApproval || request.riskLevel !== "LOW";
    if (approvalRequired && !context.approved) {
      return {
        allowed: false,
        reason: "Approval required for network request."
      };
    }

    return {
      allowed: true,
      reason: "Allowed."
    };
  }
}
