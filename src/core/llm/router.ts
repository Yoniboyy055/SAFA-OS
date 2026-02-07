import type { ChatMessage } from "./providers/openai_client";
import { runChat } from "./providers/openai_client";
import { getModel } from "./model_registry";
import type { PolicyTrace, RouterPolicyInput } from "./router_policy";
import { selectModel } from "./router_policy";

export interface RouteAndRunInput extends RouterPolicyInput {
  messages: ChatMessage[];
  jsonMode?: boolean;
}

export interface RouteAndRunResult {
  model_used: string;
  policy_trace: PolicyTrace;
  output_text: string;
  output_json?: unknown;
}

export async function routeAndRun(input: RouteAndRunInput): Promise<RouteAndRunResult> {
  const decision = selectModel(input);
  const spec = getModel(decision.selected_model);
  const result = await runChat({
    model: spec.model,
    messages: input.messages,
    jsonMode: input.jsonMode
  });
  return {
    model_used: decision.selected_model,
    policy_trace: decision.policy_trace,
    output_text: result.text,
    output_json: result.json
  };
}
