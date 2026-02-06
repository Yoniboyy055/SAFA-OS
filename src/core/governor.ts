import type { ResolvedConfig } from "./config";
import type { ActionCategory, RiskLevel } from "../types/skill";
import type { NetworkRequest } from "./network/types";
import type { AuditLogger } from "./audit";
import type { AuthorityLevel } from "./authority";
import type { CommandMode } from "../cli/command_mode";
import { validatePayloadSize, validateUrl } from "./network/types";
import { assertCommandMode } from "../cli/command_mode";
import { assertOwnerAuthority } from "./authority";
import { assertBoundedIdentity } from "./identity";
import { assertMaturityLevel, assertNoRecursivePlanning } from "./maturity";
import { assertSafeInput } from "./defense";
import { assertCostWithinBudget } from "./cost_guard";

export interface GovernanceContext {
  actor: string;
  approved: boolean;
  authority: AuthorityLevel;
  commandMode: CommandMode;
  audit: AuditLogger;
  defenseText?: string;
  maturityLevel?: number;
  freshOwnerInput?: boolean;
  costEstimateUsd?: number;
  costCapUsd?: number;
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
    assertOwnerAuthority(context.authority, context.audit, context.actor);
    assertBoundedIdentity(context.audit, context.actor);
    assertCommandMode(context.commandMode, context.audit, context.actor);
    assertMaturityLevel(
      context.maturityLevel ?? 5,
      context.audit,
      context.actor
    );
    assertNoRecursivePlanning(
      context.freshOwnerInput ?? true,
      context.audit,
      context.actor
    );
    if (context.defenseText) {
      assertSafeInput(context.defenseText, context.audit, context.actor);
    }
    assertCostWithinBudget(context.costEstimateUsd ?? 0, {
      actor: context.actor,
      approved: context.approved,
      audit: context.audit,
      costCapUsd: context.costCapUsd
    });

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
    assertOwnerAuthority(context.authority, context.audit, context.actor);
    assertBoundedIdentity(context.audit, context.actor);
    assertCommandMode(context.commandMode, context.audit, context.actor);
    assertMaturityLevel(
      context.maturityLevel ?? 5,
      context.audit,
      context.actor
    );
    assertNoRecursivePlanning(
      context.freshOwnerInput ?? true,
      context.audit,
      context.actor
    );
    if (context.defenseText) {
      assertSafeInput(context.defenseText, context.audit, context.actor);
    }
    assertCostWithinBudget(context.costEstimateUsd ?? 0, {
      actor: context.actor,
      approved: context.approved,
      audit: context.audit,
      costCapUsd: context.costCapUsd
    });

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
