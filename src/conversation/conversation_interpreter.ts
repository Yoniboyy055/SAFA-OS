import type { AuditLogger } from "../core/audit";
import type { ResolvedConfig } from "../core/config";
import type { Governor } from "../core/governor";
import { AuthorityLevel } from "../core/authority";
import { Planner } from "../core/planner";
import { buildRegistry } from "../skills/registry_factory";
import type { SkillRegistry } from "../skills/registry";
import { readFreezeState } from "../core/freeze";
import type { LlmMessage } from "../core/llm/types";
import { executeLlmCall } from "../llm/llm_executor";
import { approveLlmSession, appendMessage } from "../llm/llm_session";
import {
  appendConversationMessage,
  readConversationSession,
  writeConversationSession
} from "./session_memory";
import { classifyIntent } from "./intent_classifier";
import { buildGreeting, idlePrompt } from "./presence";
import { withCommandContext } from "../core/execution_gate";

export interface ConversationContext {
  actor: string;
  config: ResolvedConfig;
  audit: AuditLogger;
  governor: Governor;
}

export interface ConversationResponse {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
  sessionId: string;
  evidenceSummary?: string;
  requiresApproval?: boolean;
}

function buildEvidence(action: string, decision: string, touched: string[]): string {
  const touchedText = touched.length ? touched.join(", ") : "None";
  return `What happened: ${action}\nWhy: ${decision}\nWhat it touched: ${touchedText}`;
}

function resolveTouched(skill?: string, input?: Record<string, unknown>): string[] {
  if (!skill) {
    return [];
  }
  if (skill === "read_file" && input?.path) {
    return [String(input.path)];
  }
  if (skill === "list_files" && input?.path) {
    return [String(input.path)];
  }
  return [];
}

export async function handleConversation(
  message: string,
  sessionId: string,
  context: ConversationContext
): Promise<ConversationResponse> {
  const registry: SkillRegistry = buildRegistry();
  const sessionState = readConversationSession(context.config.rootDir, sessionId);
  const pending = sessionState.pending;
  const intent = classifyIntent(message, pending ? { kind: pending.kind } : undefined);
  const freezeState = readFreezeState(context.config.rootDir);

  appendConversationMessage(context.config.rootDir, sessionId, {
    role: "user",
    content: message
  } as LlmMessage);

  if (intent.type === "greeting") {
    return {
      ok: true,
      message: `${buildGreeting(new Date(), context.actor)} ${idlePrompt()}`,
      sessionId
    };
  }

  if (intent.type === "status") {
    return {
      ok: true,
      message: "Here is the current system status.",
      data: {
        networkEnabled: context.config.network.enabled,
        killSwitchEnabled: context.config.killSwitch.enabled,
        strictApprovalMode: context.config.governance.strictApprovalMode,
        freezeEnabled: freezeState.enabled
      },
      evidenceSummary: buildEvidence("Status requested", "Allowed", []),
      sessionId
    };
  }

  if (intent.type === "skills") {
    return {
      ok: true,
      message: "Here are the available skills.",
      data: {
        skills: registry.list().map((skill) => ({
          name: skill.name,
          riskLevel: skill.riskLevel,
          requiresApproval: skill.requiresApproval
        }))
      },
      evidenceSummary: buildEvidence("Skills requested", "Allowed", []),
      sessionId
    };
  }

  if (intent.type === "plan") {
    const planner = new Planner();
    const plan = planner.createPlan(intent.task, {
      actor: context.actor,
      audit: context.audit,
      authority: AuthorityLevel.OWNER,
      commandMode: "SCRIPT",
      freshOwnerInput: true
    });
    const planSummary = plan.steps
      .map((step, index) => `${index + 1}. ${step.description}`)
      .join("\n");
    return {
      ok: true,
      message: `Here is a draft plan for "${plan.task}":\n${planSummary}`,
      evidenceSummary: buildEvidence("Plan created", "Allowed", []),
      sessionId
    };
  }

  if (intent.type === "cancel_pending") {
    writeConversationSession(context.config.rootDir, sessionId, {
      ...sessionState,
      pending: undefined
    });
    return {
      ok: true,
      message: "Understood. I canceled the pending action.",
      evidenceSummary: buildEvidence("Pending action canceled", "Canceled by user", []),
      sessionId
    };
  }

  if (intent.type === "approve_pending" && pending?.kind === "skill") {
    writeConversationSession(context.config.rootDir, sessionId, {
      ...sessionState,
      pending: undefined
    });
    const execution = await withCommandContext(
      {
        id: `conv-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        actor: context.actor,
        source: "conversation",
        command: pending.skill ?? "execute"
      },
      () =>
        registry.execute(pending.skill ?? "", pending.input ?? {}, {
          actor: context.actor,
          approved: true,
          authority: AuthorityLevel.OWNER,
          commandMode: "SCRIPT",
          config: context.config,
          audit: context.audit,
          governor: context.governor,
          freezeEnabled: freezeState.enabled
        })
    );
    if (!execution.success) {
      return {
        ok: false,
        message: execution.error ?? "Action denied.",
        evidenceSummary: buildEvidence(
          pending.description,
          execution.error ?? "Denied",
          resolveTouched(pending.skill, pending.input)
        ),
        sessionId
      };
    }
    return {
      ok: true,
      message: "Done. Action completed.",
      evidenceSummary: buildEvidence(
        pending.description,
        "Approved and executed",
        resolveTouched(pending.skill, pending.input)
      ),
      sessionId
    };
  }

  if (intent.type === "approve_llm") {
    approveLlmSession(context.config.rootDir, sessionId);
    writeConversationSession(context.config.rootDir, sessionId, {
      ...sessionState,
      pending: undefined
    });
    return {
      ok: true,
      message: "LLM access approved for this session. What should we do?",
      sessionId
    };
  }

  if (intent.type === "execute") {
    writeConversationSession(context.config.rootDir, sessionId, {
      ...sessionState,
      pending: {
        kind: "skill",
        skill: intent.skill,
        input: intent.input,
        createdAt: new Date().toISOString(),
        description: `Execute ${intent.skill}`
      }
    });
    return {
      ok: true,
      message: `I can run ${intent.skill} for you. Do you approve?`,
      evidenceSummary: buildEvidence(
        `Proposed ${intent.skill}`,
        "Approval required",
        resolveTouched(intent.skill, intent.input)
      ),
      sessionId,
      requiresApproval: true
    };
  }

  try {
    appendMessage(context.config.rootDir, sessionId, {
      role: "user",
      content: message
    } as LlmMessage);
    const response = await withCommandContext(
      {
        id: `conv-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        actor: context.actor,
        source: "conversation",
        command: "chat"
      },
      () =>
        executeLlmCall(
          {
            sessionId,
            mode: "auto",
            commandText: message,
            messages: readConversationSession(context.config.rootDir, sessionId).messages,
            budget: "low",
            risk: "safe"
          },
          {
            config: context.config,
            audit: context.audit,
            governor: context.governor,
            actor: context.actor,
            approved: false,
            authority: AuthorityLevel.OWNER,
            commandMode: "SCRIPT"
          }
        )
    );
    return {
      ok: true,
      message: response.text || "Done.",
      sessionId
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (messageText.includes("LLM approval required")) {
      writeConversationSession(context.config.rootDir, sessionId, {
        ...sessionState,
        pending: {
          kind: "llm",
          createdAt: new Date().toISOString(),
          description: "Approve LLM session"
        }
      });
      return {
        ok: true,
        message: "LLM access requires approval once per session. Reply 'Yes' to approve.",
        sessionId,
        requiresApproval: true
      };
    }
    return {
      ok: false,
      message: "I can help plan, list files, or run local actions with approval. What do you want to do?",
      sessionId
    };
  }
}
