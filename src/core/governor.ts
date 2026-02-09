import type { ResolvedConfig } from "./config";
import type { ActionCategory, RiskLevel } from "../types/skill";
import type { NetworkRequest } from "./network/types";
import type { AuditLogger } from "./audit";
import type { AuthorityLevel } from "./authority";
import type { CommandMode } from "../cli/command_mode";
import type { ApprovalRequest } from "./approvals";
import { validatePayloadSize, validateUrl } from "./network/types";
import { assertCommandMode } from "../cli/command_mode";
import { assertOwnerAuthority } from "./authority";
import { assertBoundedIdentity } from "./identity";
import { assertMaturityLevel, assertNoRecursivePlanning } from "./maturity";
import { assertSafeInput } from "./defense";
import { assertCostWithinBudget } from "./cost_guard";
import type { NetworkWindowState } from "./network_window";
import { isNetworkWindowActive } from "./network_window";

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
  approval?: ApprovalRequest;
  planHash?: string;
  payloadHash?: string;
  networkWindow?: NetworkWindowState;
  freezeEnabled?: boolean;
}

export interface GovernedAction {
  type: string;
  category: ActionCategory;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  allowWhenNetworkOff: boolean;
  allowWhenFrozen?: boolean;
  allowWhenKillSwitch?: boolean;
}

export interface GovernanceDecision {
  allowed: boolean;
  reason: string;
}

export class Governor {
  private isApprovalExpired(request?: ApprovalRequest): boolean {
    if (!request?.expiresAt) {
      return false;
    }
    const expiry = Date.parse(request.expiresAt);
    return Number.isNaN(expiry) || Date.now() >= expiry;
  }

  private resolveApproval(
    action: GovernedAction,
    config: ResolvedConfig,
    context: GovernanceContext
  ): { approved: boolean; reason?: string } {
    const approvalRequired =
      config.governance?.strictApprovalMode === true ||
      action.requiresApproval ||
      action.riskLevel !== "LOW" ||
      action.category === "external_tool" ||
      action.category === "outbound_message";
    if (!approvalRequired) {
      return { approved: true };
    }

    const approvalRecord = context.approval;
    if (approvalRecord) {
      if (approvalRecord.status === "DENIED") {
        return {
          approved: false,
          reason: approvalRecord.reason ?? approvalRecord.resolutionNote ?? "Approval denied."
        };
      }
      if (approvalRecord.status === "EXPIRED" || this.isApprovalExpired(approvalRecord)) {
        return { approved: false, reason: "Approval expired." };
      }
      if (approvalRecord.status === "APPROVED") {
        return { approved: true };
      }
      return { approved: false, reason: "Approval pending." };
    }

    if (!context.approved) {
      return {
        approved: false,
        reason: config.governance?.strictApprovalMode
          ? "Strict approval required."
          : "Approval required."
      };
    }

    return { approved: true };
  }

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
    if (
      config.releaseLock?.enabled &&
      config.releaseLock.blockedCategories.includes(action.category)
    ) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "release_lock.triggered",
        approved: false,
        target: action.type,
        result: `Release lock blocked ${action.category}.`
      });
      return {
        allowed: false,
        reason: "Release lock enabled for this category."
      };
    }

    if (context.freezeEnabled && !action.allowWhenFrozen) {
      const reason = "Freeze engaged. Actions halted.";
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "freeze.blocked",
        approved: context.approved,
        target: action.type,
        result: reason
      });
      return { allowed: false, reason };
    }

    if (action.category === "network") {
      if (config.killSwitch.enabled) {
        context.audit.log({
          timestamp: new Date().toISOString(),
          actor: context.actor,
          action: "kill_switch.triggered",
          approved: false,
          target: action.type,
          result: "Kill switch enabled."
        });
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
      if (context.networkWindow && !isNetworkWindowActive(context.networkWindow)) {
        return {
          allowed: false,
          reason: "Network window is closed or expired."
        };
      }
      const approvalState = this.resolveApproval(action, config, context);
      if (!approvalState.approved) {
        return {
          allowed: false,
          reason: approvalState.reason ?? "Approval required."
        };
      }
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
      (action.category === "outbound_message" ||
        action.category === "external_tool") &&
      !action.allowWhenKillSwitch
    ) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "kill_switch.triggered",
        approved: false,
        target: action.type,
        result: "Kill switch enabled."
      });
      return {
        allowed: false,
        reason: "Kill switch enabled for outbound actions."
      };
    }

    if (!action.allowWhenNetworkOff && !config.network.enabled) {
      return {
        allowed: false,
        reason: "Action not allowed when network is OFF."
      };
    }

    const approvalState = this.resolveApproval(action, config, context);
    if (!approvalState.approved) {
      return {
        allowed: false,
        reason: approvalState.reason ?? "Approval required."
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

    if (
      config.releaseLock?.enabled &&
      config.releaseLock.blockedCategories.includes("network")
    ) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "release_lock.triggered",
        approved: false,
        target: request.url,
        result: "Release lock blocked network requests."
      });
      return {
        allowed: false,
        reason: "Release lock enabled for network."
      };
    }

    if (config.killSwitch.enabled) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "kill_switch.triggered",
        approved: false,
        target: request.url,
        result: "Kill switch enabled."
      });
      return {
        allowed: false,
        reason: "Kill switch enabled for outbound actions."
      };
    }

    const approvalDecision = this.resolveApproval(
      {
        type: request.id,
        category: "network",
        riskLevel: request.riskLevel,
        requiresApproval: request.requiresApproval,
        allowWhenNetworkOff: false
      },
      config,
      context
    );
    if (!approvalDecision.approved) {
      return {
        allowed: false,
        reason: approvalDecision.reason ?? "Approval required."
      };
    }

    if (config.governance?.networkApprovalMode === "plan_hash") {
      if (!context.planHash) {
        return {
          allowed: false,
          reason: "Plan hash required for network approval."
        };
      }
      const approval = context.approval;
      if (!approval || approval.status !== "APPROVED" || approval.planHash !== context.planHash) {
        return {
          allowed: false,
          reason: "Approval record required for plan hash."
        };
      }
    }

    if (!config.network.enabled) {
      return {
        allowed: false,
        reason: "Network is disabled by default."
      };
    }

    if (context.networkWindow && !isNetworkWindowActive(context.networkWindow)) {
      return {
        allowed: false,
        reason: "Network window is closed or expired."
      };
    }

    const urlDecision = validateUrl(request.url, {
      allowlistDomains: config.network.allowlistDomains,
      allowlistUrls: config.network.allowlistUrls,
      allowHttp: false,
      maxPayloadBytes: config.governance.maxNetworkPayloadBytes
    });
    if (!urlDecision.allowed) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "allowlist.violation",
        approved: false,
        target: request.url,
        result: urlDecision.reason
      });
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

    const approvalState = this.resolveApproval(
      {
        type: request.id,
        category: "network",
        riskLevel: request.riskLevel,
        requiresApproval: request.requiresApproval,
        allowWhenNetworkOff: false
      },
      config,
      context
    );
    if (!approvalState.approved) {
      return {
        allowed: false,
        reason: approvalState.reason ?? "Approval required."
      };
    }

    return {
      allowed: true,
      reason: "Allowed."
    };
  }
}
