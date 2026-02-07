export type LayerState = "ACTIVE" | "LOCKED" | "DISABLED";

export interface LayerDefinition {
  id: number;
  name: string;
  description: string;
  state: LayerState;
}

export function getLayerDefinitions(): LayerDefinition[] {
  return [
    {
      id: 1,
      name: "Core reasoning & planning",
      description: "Parser, planner, governor, and audit logic.",
      state: "ACTIVE"
    },
    {
      id: 2,
      name: "Automation & workflows",
      description: "Local skills, memory, knowledge, and task runner.",
      state: "ACTIVE"
    },
    {
      id: 3,
      name: "External interaction (email/calls/network)",
      description: "Outbound capabilities are wired but locked.",
      state: "LOCKED"
    },
    {
      id: 4,
      name: "Autonomous expansion / agent spawning",
      description: "Implemented but disabled (no execution).",
      state: "DISABLED"
    }
  ];
}
