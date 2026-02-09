import type { PlanOutput, PlanStep } from "../types/plan";
import type { AuditLogger } from "./audit";
import type { AuthorityLevel } from "./authority";
import type { CommandMode } from "../cli/command_mode";
import type { ResolvedConfig } from "./config";
import type { Governor } from "./governor";
import { assertSafeInput } from "./defense";
import { assertNoRecursivePlanning } from "./maturity";
import { callLLM, isLLMAvailable } from "../ai/llm_provider";
import { LLMProvider } from "../ai/types";

export interface PlannerContext {
  actor: string;
  audit: AuditLogger;
  authority: AuthorityLevel;
  commandMode: CommandMode;
  freshOwnerInput?: boolean;
  config?: ResolvedConfig;
  governor?: Governor;
  useLLM?: boolean;
}

/**
 * Generate a static fallback plan (current implementation)
 */
function generateStaticPlan(task: string): PlanOutput {
  const steps: PlanStep[] = [
    {
      id: "step-1",
      description: "List top-level files to orient within the workspace.",
      suggested_skill: "list_files",
      input_example: {
        path: ".",
        recursive: false,
        maxEntries: 200,
        includeDirectories: true
      },
      riskLevel: "LOW",
      requiresApproval: false
    },
    {
      id: "step-2",
      description: "Search for task-related text in the workspace.",
      suggested_skill: "search_text",
      input_example: {
        path: ".",
        query: task,
        recursive: true,
        maxResults: 25
      },
      riskLevel: "LOW",
      requiresApproval: false
    }
  ];

  return {
    task,
    steps,
    stress_tests: [
      {
        failure_mode: "Task text does not match any files.",
        mitigation: "Ask for clarification or adjust the search query."
      },
      {
        failure_mode: "Large directories cause truncated search results.",
        mitigation: "Narrow search scope or increase maxResults."
      }
    ],
    assumptions: [
      "Execution is local-only with networking disabled.",
      "Requested files are within allowlisted paths."
    ]
  };
}

/**
 * Generate an LLM-powered plan using available skills
 */
async function generateLLMPlan(
  task: string,
  context: PlannerContext
): Promise<PlanOutput> {
  if (!context.config || !context.governor || !context.audit) {
    throw new Error("Config, governor, and audit are required for LLM planning");
  }

  // Build system prompt with available skills
  const systemPrompt = `You are a task planning assistant for Jarvis OS, a governed AI system.

Your job is to break down a user task into a sequence of executable steps using available skills.

Available skills (examples):
- list_files: List files in a directory
- search_text: Search for text in files
- read_file: Read a file's contents
- write_file: Write content to a file
- send_email: Send an email (requires approval)
- http_request: Make HTTP request (requires approval)

Output a JSON plan with this structure:
{
  "task": "the original task",
  "steps": [
    {
      "id": "step-1",
      "description": "Brief description of this step",
      "suggested_skill": "skill_name",
      "input_example": { "param": "value" },
      "riskLevel": "LOW" | "MEDIUM" | "HIGH",
      "requiresApproval": true | false
    }
  ],
  "stress_tests": [
    {
      "failure_mode": "What could go wrong",
      "mitigation": "How to handle it"
    }
  ],
  "assumptions": ["assumption 1", "assumption 2"]
}

Guidelines:
- Keep plans simple and focused (2-5 steps)
- Mark network/external operations as HIGH risk
- Mark file writes as MEDIUM risk
- Mark file reads as LOW risk
- Require approval for risky operations
- Include realistic stress tests and assumptions`;

  const userPrompt = `Create a step-by-step plan for this task:\n\n${task}`;

  try {
    const response = await callLLM(
      {
        provider: LLMProvider.OpenAI,
        model: context.config.llm?.model || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: context.config.llm?.temperature ?? 0.2,
        maxTokens: context.config.llm?.maxTokensPerRequest ?? 2000,
      },
      {
        config: context.config,
        audit: context.audit,
        governor: context.governor,
        actor: context.actor,
        approved: false,
        authority: context.authority,
        commandMode: context.commandMode,
      }
    );

    // Parse LLM response as JSON
    let planOutput: PlanOutput;
    try {
      // Try to extract JSON from response (may be wrapped in markdown)
      const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : response.content;
      planOutput = JSON.parse(jsonText);
    } catch (parseError) {
      context.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "plan.llm_parse_error",
        approved: false,
        target: "planner",
        result: `Failed to parse LLM response: ${parseError}`,
      });
      throw new Error("Failed to parse LLM plan output. Falling back to static plan.");
    }

    // Validate plan structure
    if (!planOutput.task || !Array.isArray(planOutput.steps)) {
      throw new Error("Invalid plan structure from LLM");
    }

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "plan.llm_success",
      approved: false,
      target: "planner",
      result: `Generated ${planOutput.steps.length} steps using LLM`,
    });

    return planOutput;
  } catch (error) {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "plan.llm_fallback",
      approved: false,
      target: "planner",
      result: `LLM planning failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}

export class Planner {
  async createPlan(task: string, context?: PlannerContext): Promise<PlanOutput> {
    const trimmed = task.trim();
    if (!trimmed) {
      throw new Error("Task is required for planning.");
    }
    if (context) {
      assertSafeInput(trimmed, context.audit, context.actor);
      assertNoRecursivePlanning(
        context.freshOwnerInput ?? true,
        context.audit,
        context.actor
      );
    }

    // Determine if LLM should be used
    const shouldUseLLM =
      context?.useLLM === true ||
      (context?.config?.llm?.enabled && 
       !context?.config?.llm?.fallbackToStatic &&
       context?.config &&
       context?.governor &&
       isLLMAvailable(context.config));

    // Try LLM planning if enabled
    if (shouldUseLLM && context) {
      try {
        return await generateLLMPlan(trimmed, context);
      } catch (error) {
        // Fall back to static if LLM fails and fallback is enabled
        if (context.config?.llm?.fallbackToStatic !== false) {
          context.audit?.log({
            timestamp: new Date().toISOString(),
            actor: context.actor,
            action: "plan.fallback_to_static",
            approved: false,
            target: "planner",
            result: "Using static plan after LLM failure",
          });
          return generateStaticPlan(trimmed);
        }
        throw error;
      }
    }

    // Use static plan
    return generateStaticPlan(trimmed);
  }
}
