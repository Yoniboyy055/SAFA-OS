import type { AuditLogger } from "./audit";

interface DefenseResult {
  detected: boolean;
  reasons: string[];
}

const INJECTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "prompt_injection", regex: /ignore (all|previous) instructions/i },
  { name: "prompt_injection", regex: /system prompt|developer message/i },
  { name: "authority_impersonation", regex: /act as (the )?owner|you are the owner/i },
  { name: "override_attempt", regex: /bypass|override|jailbreak/i }
];

const SCAM_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "social_engineering", regex: /urgent|wire money|gift cards/i },
  { name: "scam_language", regex: /bank transfer|crypto wallet|seed phrase/i },
  { name: "credential_harvest", regex: /password|one-time code|2fa/i }
];

const OTHER_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "goal_setting", regex: /set (a )?goal|define (a )?goal/i }
];

export function scanInput(text: string): DefenseResult {
  if (!text) {
    return { detected: false, reasons: [] };
  }
  const reasons: string[] = [];
  for (const pattern of [...INJECTION_PATTERNS, ...SCAM_PATTERNS, ...OTHER_PATTERNS]) {
    if (pattern.regex.test(text)) {
      reasons.push(pattern.name);
    }
  }
  return {
    detected: reasons.length > 0,
    reasons
  };
}

export function detectPromptInjection(text: string): DefenseResult {
  const reasons: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.regex.test(text)) {
      reasons.push(pattern.name);
    }
  }
  return { detected: reasons.length > 0, reasons };
}

export function detectScamIndicators(text: string): DefenseResult {
  const reasons: string[] = [];
  for (const pattern of SCAM_PATTERNS) {
    if (pattern.regex.test(text)) {
      reasons.push(pattern.name);
    }
  }
  return { detected: reasons.length > 0, reasons };
}

export function classifyRisk(text: string): "LOW" | "MEDIUM" | "HIGH" {
  const injection = detectPromptInjection(text);
  const scam = detectScamIndicators(text);
  if (injection.detected || scam.detected) {
    return "HIGH";
  }
  const other = scanInput(text);
  if (other.detected) {
    return "MEDIUM";
  }
  return "LOW";
}

export function assertSafeInput(
  text: string,
  audit: AuditLogger,
  actor: string
): void {
  const result = scanInput(text);
  if (result.detected) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "DEFENSE_DETECTION",
      approved: false,
      target: "input",
      result: `Detected: ${result.reasons.join(", ")}`
    });
    throw new Error(
      "Refused: potential prompt injection or unsafe request. Please rephrase."
    );
  }
}
