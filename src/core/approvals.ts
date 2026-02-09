import * as crypto from "node:crypto";

import type { AuditLogger } from "./audit";
import type { RiskLevel } from "../types/skill";

export type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";

export interface ApprovalRequest {
  id: string;
  action: string;
  target: string;
  actor: string;
  jobId?: string;
  riskLevel?: RiskLevel;
  reasonCode?: string;
  status: ApprovalStatus;
  createdAt: string;
  expiresAt?: string;
  planHash?: string;
  payloadHash?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
}

export interface ApprovalPolicy {
  requirePlanHash?: boolean;
  requirePayloadHash?: boolean;
  expiresInMs?: number;
}

export interface ApprovalContext {
  actor: string;
  audit: AuditLogger;
}

export interface Receipt {
  id: string;
  action: string;
  target: string;
  actor: string;
  approved: boolean;
  status: "SUCCESS" | "DENIED" | "ERROR";
  createdAt: string;
  approvalId?: string;
  planHash?: string;
  payloadHash?: string;
  resultHash?: string;
  note?: string;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeJson(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createApprovalRequest(
  input: {
    action: string;
    target: string;
    jobId?: string;
    riskLevel?: RiskLevel;
    reasonCode?: string;
    plan?: unknown;
    payload?: unknown;
    policy?: ApprovalPolicy;
  },
  context: ApprovalContext
): ApprovalRequest {
  const policy = input.policy ?? {};
  if (policy.requirePlanHash && input.plan === undefined) {
    throw new Error("Plan hash required for approval.");
  }
  if (policy.requirePayloadHash && input.payload === undefined) {
    throw new Error("Payload hash required for approval.");
  }

  const planHash =
    input.plan !== undefined ? hashValue(safeJson(input.plan)) : undefined;
  const payloadHash =
    input.payload !== undefined ? hashValue(safeJson(input.payload)) : undefined;
  const createdAt = new Date().toISOString();
  const expiresAt =
    typeof policy.expiresInMs === "number" && policy.expiresInMs > 0
      ? new Date(Date.now() + policy.expiresInMs).toISOString()
      : undefined;

  const request: ApprovalRequest = {
    id: `apr-${hashValue(`${input.action}:${input.target}:${createdAt}`).slice(
      0,
      12
    )}`,
    action: input.action,
    target: input.target,
    actor: context.actor,
    jobId: input.jobId,
    riskLevel: input.riskLevel,
    reasonCode: input.reasonCode,
    status: "PENDING",
    createdAt,
    expiresAt,
    planHash,
    payloadHash
  };

  context.audit.log({
    timestamp: createdAt,
    actor: context.actor,
    action: "approval.requested",
    approved: false,
    target: input.target,
    result: JSON.stringify({
      id: request.id,
      status: request.status,
      planHash,
      payloadHash,
      expiresAt
    })
  });

  return request;
}

export function isExpired(request: ApprovalRequest, now = Date.now()): boolean {
  if (!request.expiresAt) {
    return false;
  }
  return now >= Date.parse(request.expiresAt);
}

export function approveRequest(
  request: ApprovalRequest,
  context: ApprovalContext
): ApprovalRequest {
  if (isExpired(request)) {
    return expireRequest(request, context, "Approval expired.");
  }
  const decidedAt = new Date().toISOString();
  const approved: ApprovalRequest = {
    ...request,
    status: "APPROVED",
    resolvedAt: decidedAt,
    resolvedBy: context.actor,
    decidedAt,
    decidedBy: context.actor
  };
  context.audit.log({
    timestamp: decidedAt,
    actor: context.actor,
    action: "approval.approved",
    approved: true,
    target: request.target,
    result: approved.id
  });
  return approved;
}

export function denyRequest(
  request: ApprovalRequest,
  context: ApprovalContext,
  reason: string
): ApprovalRequest {
  const decidedAt = new Date().toISOString();
  const denied: ApprovalRequest = {
    ...request,
    status: "DENIED",
    resolvedAt: decidedAt,
    resolvedBy: context.actor,
    resolutionNote: reason,
    decidedAt,
    decidedBy: context.actor,
    reason
  };
  context.audit.log({
    timestamp: decidedAt,
    actor: context.actor,
    action: "approval.denied",
    approved: false,
    target: request.target,
    result: reason
  });
  return denied;
}

export function revokeRequest(
  request: ApprovalRequest,
  context: ApprovalContext,
  reason = "Approval revoked."
): ApprovalRequest {
  return denyRequest(request, context, reason);
}

export function expireRequest(
  request: ApprovalRequest,
  context: ApprovalContext,
  reason: string
): ApprovalRequest {
  const decidedAt = new Date().toISOString();
  const expired: ApprovalRequest = {
    ...request,
    status: "EXPIRED",
    resolvedAt: decidedAt,
    resolvedBy: context.actor,
    resolutionNote: reason,
    decidedAt,
    decidedBy: context.actor,
    reason
  };
  context.audit.log({
    timestamp: decidedAt,
    actor: context.actor,
    action: "approval.expired",
    approved: false,
    target: request.target,
    result: reason
  });
  return expired;
}

export function createReceipt(
  input: {
    approval?: ApprovalRequest;
    action: string;
    target: string;
    actor: string;
    approved: boolean;
    status: "SUCCESS" | "DENIED" | "ERROR";
    result?: unknown;
    note?: string;
  },
  context: ApprovalContext
): Receipt {
  const createdAt = new Date().toISOString();
  const resultHash =
    input.result !== undefined ? hashValue(safeJson(input.result)) : undefined;

  const receipt: Receipt = {
    id: `rcpt-${hashValue(`${input.action}:${createdAt}`).slice(0, 12)}`,
    action: input.action,
    target: input.target,
    actor: input.actor,
    approved: input.approved,
    status: input.status,
    createdAt,
    approvalId: input.approval?.id,
    planHash: input.approval?.planHash,
    payloadHash: input.approval?.payloadHash,
    resultHash,
    note: input.note
  };

  context.audit.log({
    timestamp: createdAt,
    actor: context.actor,
    action: "receipt.created",
    approved: input.approved,
    target: input.target,
    result: JSON.stringify({
      id: receipt.id,
      status: receipt.status,
      approvalId: receipt.approvalId,
      planHash: receipt.planHash,
      payloadHash: receipt.payloadHash,
      resultHash
    })
  });

  return Object.freeze(receipt);
}
