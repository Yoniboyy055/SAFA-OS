import type { ResolvedConfig } from "./config";

interface PhaseGuardDecision {
  allowed: boolean;
  requiredPhase?: number;
  reason?: string;
}

const PHASE_REQUIREMENTS: Record<string, number> = {
  send_http_request: 4,
  send_email_request: 5,
  request_phone_call: 5,
  request_payment: 5,
  send_email: 7,
  make_call: 7,
  request_client_intake: 13,
  request_negotiation_script: 13,
  request_follow_up: 13,
  request_recommendation_request: 13,
  request_video_edit: 13,
  request_web_build: 13,
  request_doc_pack: 13,
  request_image_edit: 13
};

function resolveCurrentPhase(config: ResolvedConfig): number {
  const current = config.phase?.current;
  return typeof current === "number" && Number.isFinite(current) ? current : 17;
}

export function evaluatePhaseGuard(
  skillName: string,
  config: ResolvedConfig
): PhaseGuardDecision {
  const requiredPhase = PHASE_REQUIREMENTS[skillName];
  if (!requiredPhase) {
    return { allowed: true };
  }
  const current = resolveCurrentPhase(config);
  if (current >= requiredPhase) {
    return { allowed: true, requiredPhase };
  }
  return {
    allowed: false,
    requiredPhase,
    reason: `Phase ${current} blocks ${skillName}; requires phase ${requiredPhase}.`
  };
}
