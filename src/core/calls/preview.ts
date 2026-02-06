import * as crypto from "node:crypto";

import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import { makeCall } from "./client";

export interface CallPreviewContext {
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

export interface CallPreviewResult {
  previewHash: string;
  plan: {
    method: "POST";
    url: string;
    body: string;
  };
  costEstimateUsd: number;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function previewDial(
  input: {
    toNumber: string;
    intent: string;
    notes?: string;
  },
  context: CallPreviewContext
): Promise<CallPreviewResult> {
  const result = await makeCall(
    {
      ...input,
      dryRun: true
    },
    context
  );

  if (!result.plan) {
    throw new Error("Preview plan is missing.");
  }

  const previewHash = result.previewHash || hashValue(JSON.stringify(result.plan));
  const costEstimateUsd = context.costEstimateUsd ?? 0;

  context.audit.log({
    timestamp: new Date().toISOString(),
    actor: context.actor,
    action: "preview.created",
    approved: context.approved,
    target: "calls",
    result: JSON.stringify({ previewHash, costEstimateUsd })
  });

  return {
    previewHash,
    plan: result.plan,
    costEstimateUsd
  };
}
