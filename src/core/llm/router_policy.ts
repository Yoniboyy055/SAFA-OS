import type { ModelId } from "./model_registry";
import { findModelByTag, isModelId } from "./model_registry";

export type TaskType = "chat" | "code" | "vision" | "admin";
export type Sensitivity = "low" | "med" | "high";
export type LatencyPref = "fast" | "balanced" | "deep";
export type BudgetPref = "cheap" | "balanced" | "premium";
export type RouterMode = "auto" | "manual";

export interface RouterPolicyInput {
  task_type: TaskType;
  sensitivity: Sensitivity;
  latency_pref: LatencyPref;
  budget_pref: BudgetPref;
  explicit_model?: ModelId;
  mode: RouterMode;
}

export interface PolicyTrace {
  inputs: RouterPolicyInput;
  rule: string;
  reason_model_configured: boolean;
  fallback_used: boolean;
}

export interface PolicyDecision {
  selected_model: ModelId;
  reason: string;
  policy_trace: PolicyTrace;
}

function resolveReasonModel(): ModelId | undefined {
  const envValue = process.env.ROUTER_REASON_MODEL;
  if (envValue && isModelId(envValue)) {
    return envValue;
  }
  return undefined;
}

function trace(
  inputs: RouterPolicyInput,
  rule: string,
  reasonModelConfigured: boolean,
  fallbackUsed: boolean
): PolicyTrace {
  return {
    inputs,
    rule,
    reason_model_configured: reasonModelConfigured,
    fallback_used: fallbackUsed
  };
}

export function selectModel(input: RouterPolicyInput): PolicyDecision {
  const reasonModel = resolveReasonModel();
  const reasonConfigured = Boolean(reasonModel);

  if (input.mode === "manual" && input.explicit_model) {
    return {
      selected_model: input.explicit_model,
      reason: "Manual mode with explicit model.",
      policy_trace: trace(input, "manual_override", reasonConfigured, false)
    };
  }

  if (input.task_type === "vision") {
    const vision = findModelByTag("vision");
    if (vision) {
      return {
        selected_model: vision.id,
        reason: "Vision task routed to vision model.",
        policy_trace: trace(input, "vision_task", reasonConfigured, false)
      };
    }
  }

  if (input.task_type === "code") {
    const code = findModelByTag("code");
    if (code) {
      return {
        selected_model: code.id,
        reason: "Code task routed to code model.",
        policy_trace: trace(input, "code_task", reasonConfigured, false)
      };
    }
  }

  if (input.latency_pref === "fast" || input.budget_pref === "cheap") {
    const core = findModelByTag("core");
    if (core) {
      return {
        selected_model: core.id,
        reason: "Fast/cheap preference routed to core model.",
        policy_trace: trace(input, "fast_or_cheap", reasonConfigured, false)
      };
    }
  }

  if (input.sensitivity === "high" || input.latency_pref === "deep") {
    if (reasonModel) {
      return {
        selected_model: reasonModel,
        reason: "High sensitivity or deep preference routed to reason model.",
        policy_trace: trace(input, "deep_or_sensitive", reasonConfigured, false)
      };
    }
    const core = findModelByTag("core");
    if (core) {
      return {
        selected_model: core.id,
        reason: "Reason model not configured; fallback to core.",
        policy_trace: trace(input, "reason_fallback", reasonConfigured, true)
      };
    }
  }

  const core = findModelByTag("core");
  if (!core) {
    throw new Error("No core model available in registry.");
  }
  return {
    selected_model: core.id,
    reason: "Defaulting to core model.",
    policy_trace: trace(input, "default_core", reasonConfigured, false)
  };
}
