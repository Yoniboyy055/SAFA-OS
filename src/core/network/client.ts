import type { AuditLogger } from "../audit";
import type { ResolvedConfig } from "../config";
import type { Governor } from "../governor";
import type { NetworkRequest, NetworkResponseMeta } from "./types";
import { requestNetwork as performNetworkRequest } from "./request";

export interface NetworkClientContext {
  actor: string;
  approved: boolean;
  authority: import("../authority").AuthorityLevel;
  commandMode: import("../../cli/command_mode").CommandMode;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
}

export async function requestNetwork(
  request: NetworkRequest,
  context: NetworkClientContext
): Promise<NetworkResponseMeta> {
  const response = await performNetworkRequest(
    {
      method: request.method as "GET" | "POST",
      url: request.url,
      headers: request.headers,
      body: request.bodySummary,
      purpose: request.purpose
    },
    {
      actor: context.actor,
      approved: context.approved,
      authority: context.authority,
      commandMode: context.commandMode,
      config: context.config,
      audit: context.audit,
      governor: context.governor,
      defenseText: request.bodySummary
    }
  );

  return {
    status: response.status,
    bytes: response.responseBytes,
    durationMs: response.durationMs,
    responseHash: response.responseHash
  };
}
