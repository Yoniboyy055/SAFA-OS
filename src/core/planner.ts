import type { PlanOutput, PlanStep } from "../types/plan";
import type { AuditLogger } from "./audit";
import type { AuthorityLevel } from "./authority";
import type { CommandMode } from "../cli/command_mode";
import { assertSafeInput } from "./defense";
import { assertNoRecursivePlanning } from "./maturity";

export interface PlannerContext {
  actor: string;
  audit: AuditLogger;
  authority: AuthorityLevel;
  commandMode: CommandMode;
  freshOwnerInput?: boolean;
}

export class Planner {
  createPlan(task: string, context?: PlannerContext): PlanOutput {
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
          query: trimmed,
          recursive: true,
          maxResults: 25
        },
        riskLevel: "LOW",
        requiresApproval: false
      }
    ];

    return {
      task: trimmed,
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
}
