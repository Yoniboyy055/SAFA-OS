import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { requestNetwork } from "../../core/network/client";

interface SendHttpRequestInput {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  purpose?: string;
}

interface SendHttpRequestOutput {
  status: number;
  responseHash: string;
  responseBytes: number;
  durationMs: number;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export const sendHttpRequestSkill: SkillDefinition<
  SendHttpRequestInput,
  SendHttpRequestOutput
> = {
  name: "send_http_request",
  description: "Send a governed HTTP request through the network corridor.",
  inputSchema: {
    type: "object",
    required: ["method", "url"],
    properties: {
      method: { type: "string", description: "HTTP method (GET/POST)." },
      url: { type: "string", description: "Destination URL." },
      headers: { type: "object", description: "Optional headers." },
      body: { type: "string", description: "Optional request body." },
      timeoutMs: { type: "number", description: "Optional timeout in ms." },
      purpose: { type: "string", description: "Request purpose." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: false,
  category: "network",
  auditTemplate: {
    action: "send_http_request",
    target: (input) => input.url
  },
  handler: async (input, context) => {
    const body = input.body ?? "";
    const response = await requestNetwork(
      {
        id: `net-${hashValue(`${input.method}:${input.url}`).slice(0, 12)}`,
        purpose: input.purpose ?? "send_http_request",
        method: input.method,
        url: input.url,
        headers: input.headers ?? {},
        bodySummary: body,
        bodyHash: body ? hashValue(body) : "",
        riskLevel: "HIGH",
        requiresApproval: true
      },
      {
        actor: context.actor,
        approved: context.approved,
        authority: context.authority,
        commandMode: context.commandMode,
        config: context.config,
        audit: context.audit,
        governor: context.governor
      }
    );

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "send_http_request.result",
      approved: context.approved,
      target: input.url,
      result: JSON.stringify({
        status: response.status,
        responseHash: response.responseHash,
        responseBytes: response.bytes,
        durationMs: response.durationMs,
        bodyHash: body ? hashValue(body) : ""
      })
    });

    return {
      status: response.status,
      responseHash: response.responseHash,
      responseBytes: response.bytes,
      durationMs: response.durationMs
    };
  }
};
