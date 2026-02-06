import * as crypto from "node:crypto";

import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";

export interface PostPreviewContext {
  actor: string;
  approved: boolean;
  authority: import("../authority").AuthorityLevel;
  commandMode: import("../../cli/command_mode").CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
  costEstimateUsd?: number;
  costCapUsd?: number;
}

export interface PostPreviewResult {
  previewHash: string;
  plan: {
    channel: string;
    content: string;
  };
  costEstimateUsd: number;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function previewPublish(
  input: { channel: string; content: string },
  context: PostPreviewContext
): PostPreviewResult {
  const decision = context.governor.evaluate(
    {
      type: "post.preview",
      category: "outbound_message",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: true
    },
    context.config,
    {
      actor: context.actor,
      approved: context.approved,
      authority: context.authority,
      commandMode: context.commandMode,
      audit: context.audit,
      defenseText: input.content,
      maturityLevel: 5,
      freshOwnerInput: true,
      costEstimateUsd: context.costEstimateUsd ?? 0,
      costCapUsd: context.costCapUsd
    }
  );

  if (!decision.allowed) {
    throw new Error(decision.reason);
  }

  const plan = {
    channel: input.channel,
    content: input.content
  };
  const previewHash = hashValue(JSON.stringify(plan));
  const costEstimateUsd = context.costEstimateUsd ?? 0;

  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "preview.created",
    approved: context.approved,
    target: input.channel,
    result: JSON.stringify({ previewHash, costEstimateUsd })
  });

  return {
    previewHash,
    plan,
    costEstimateUsd
  };
}
