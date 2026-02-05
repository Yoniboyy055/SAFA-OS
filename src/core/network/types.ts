import type { RiskLevel } from "../../types/skill";

export interface NetworkRequest {
  id: string;
  purpose: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  bodySummary: string;
  bodyHash: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export interface NetworkDecision {
  allowed: boolean;
  reason: string;
}

export interface NetworkResponseMeta {
  status: number;
  bytes: number;
  durationMs: number;
  responseHash: string;
}

export interface UrlValidationResult extends NetworkDecision {
  normalizedUrl: string;
  hostname: string;
  protocol: string;
}

export interface NetworkValidationOptions {
  allowlistDomains: string[];
  allowlistUrls?: string[];
  allowHttp?: boolean;
  maxPayloadBytes: number;
}

function normalizeUrlString(input: string): string {
  const url = new URL(input);
  url.hash = "";
  let normalized = url.toString();
  if (normalized.endsWith("/") && url.pathname !== "/") {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase();
}

function isDomainAllowed(hostname: string, allowlist: string[]): boolean {
  const normalizedHost = normalizeDomain(hostname);
  return allowlist.some((domain) => {
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) {
      return false;
    }
    return (
      normalizedHost === normalizedDomain ||
      normalizedHost.endsWith(`.${normalizedDomain}`)
    );
  });
}

function normalizeAllowlistUrls(urls: string[]): string[] {
  return urls
    .map((entry) => {
      try {
        return normalizeUrlString(entry);
      } catch {
        return entry.trim();
      }
    })
    .filter((entry) => entry.length > 0);
}

export function validateUrl(
  inputUrl: string,
  options: NetworkValidationOptions
): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch (error) {
    return {
      allowed: false,
      reason: "Invalid URL.",
      normalizedUrl: "",
      hostname: "",
      protocol: ""
    };
  }

  const protocol = parsed.protocol.replace(":", "").toLowerCase();
  if (protocol !== "https" && !(options.allowHttp && protocol === "http")) {
    return {
      allowed: false,
      reason: "Only https URLs are allowed.",
      normalizedUrl: "",
      hostname: parsed.hostname,
      protocol
    };
  }

  if (!options.allowlistDomains || options.allowlistDomains.length === 0) {
    return {
      allowed: false,
      reason: "No allowlisted domains configured.",
      normalizedUrl: "",
      hostname: parsed.hostname,
      protocol
    };
  }

  if (!isDomainAllowed(parsed.hostname, options.allowlistDomains)) {
    return {
      allowed: false,
      reason: "Domain is not allowlisted.",
      normalizedUrl: "",
      hostname: parsed.hostname,
      protocol
    };
  }

  const normalizedUrl = normalizeUrlString(inputUrl);
  const allowlistUrls = options.allowlistUrls ?? [];
  if (allowlistUrls.length > 0) {
    const normalizedAllowlist = normalizeAllowlistUrls(allowlistUrls);
    if (!normalizedAllowlist.includes(normalizedUrl)) {
      return {
        allowed: false,
        reason: "URL is not allowlisted.",
        normalizedUrl,
        hostname: parsed.hostname,
        protocol
      };
    }
  }

  return {
    allowed: true,
    reason: "Allowed.",
    normalizedUrl,
    hostname: parsed.hostname,
    protocol
  };
}

export function estimatePayloadBytes(bodySummary: string): number {
  if (!bodySummary) {
    return 0;
  }
  return new TextEncoder().encode(bodySummary).length;
}

export function validatePayloadSize(
  bodySummary: string,
  maxPayloadBytes: number
): NetworkDecision {
  const bytes = estimatePayloadBytes(bodySummary);
  if (bytes > maxPayloadBytes) {
    return {
      allowed: false,
      reason: `Payload exceeds max of ${maxPayloadBytes} bytes.`
    };
  }
  return {
    allowed: true,
    reason: "Allowed."
  };
}
