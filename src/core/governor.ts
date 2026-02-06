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
  private resolveApproval(
    action: GovernedAction,
    config: ResolvedConfig,
    context: GovernanceContext
  ): { approved: boolean; reason?: string } {
    const approvalRequired =
      config.governance.strictApprovalMode ||
      action.category === "network" ||
      action.requiresApproval ||
      action.riskLevel !== "LOW";

    if (!approvalRequired) {
      return { approved: true };
    }

    const approval = context.approval;
    if (!approval) {
      if (context.approved) {
        context.audit.log({
          timestamp: new Date().toISOString(),
          actor: context.actor,
          action: "approval.approved",
          approved: true,
          target: action.type,
          result: "Explicit approval flag."
        });
        return { approved: true };
      }
      const reason = config.governance.strictApprovalMode
        ? "Strict approval mode requires explicit approval."
        : "Approval required.";
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "approval.denied",
        approved: false,
        target: action.type,
        result: reason
      });
      return { approved: false, reason };
    }

    if (approval.expiresAt && Date.now() >= Date.parse(approval.expiresAt)) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "approval.expired",
        approved: false,
        target: action.type,
        result: "Approval expired."
      });
      return { approved: false, reason: "Approval expired." };
    }

    if (approval.status === "DENIED") {
      const reason = approval.reason ?? "Approval denied.";
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "approval.denied",
        approved: false,
        target: action.type,
        result: reason
      });
      return { approved: false, reason };
    }

    if (approval.status === "PENDING") {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "approval.pending",
        approved: false,
        target: action.type,
        result: "Approval pending."
      });
      return { approved: false, reason: "Approval pending." };
    }

    if (approval.status !== "APPROVED") {
      return { approved: false, reason: "Approval not granted." };
    }

    if (approval.planHash && context.planHash !== approval.planHash) {
      const reason = "Approval plan hash mismatch.";
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "approval.mismatch",
        approved: false,
        target: action.type,
        result: reason
      });
      return { approved: false, reason };
    }

    if (approval.payloadHash && context.payloadHash !== approval.payloadHash) {
      const reason = "Approval payload hash mismatch.";
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "approval.mismatch",
        approved: false,
        target: action.type,
        result: reason
      });
      return { approved: false, reason };
    }

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "approval.approved",
      approved: true,
      target: action.type,
      result: approval.id
    });
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
        action.category === "external_tool")
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
