import type { ResolvedConfig } from "../core/config";
import type { LlmProviderId } from "../core/llm/types";
import { validateUrl } from "../core/network/types";

function resolveProviderEndpoint(providerId: LlmProviderId): string {
  if (providerId === "openai") {
    return "https://api.openai.com/v1/chat/completions";
  }
  if (providerId === "anthropic") {
    return "https://api.anthropic.com/v1/messages";
  }
  if (providerId === "google") {
    return "https://generativelanguage.googleapis.com";
  }
  throw new Error(`No endpoint registered for provider: ${providerId}`);
}

export function assertLlmHostAllowed(
  config: ResolvedConfig,
  providerId: LlmProviderId
): void {
  const endpoint = resolveProviderEndpoint(providerId);
  const decision = validateUrl(endpoint, {
    allowlistDomains: config.network.allowlistDomains ?? [],
    allowlistUrls: config.network.allowlistUrls ?? [],
    allowHttp: false,
    maxPayloadBytes: config.governance.maxNetworkPayloadBytes
  });
  if (!decision.allowed) {
    throw new Error(`LLM host not allowlisted: ${decision.reason}`);
  }
}
