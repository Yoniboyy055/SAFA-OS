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
      name: "Human interface",
      description: "Calm chat front door and minimal UI.",
      state: "ACTIVE"
    },
    {
      id: 2,
      name: "Control & governance layer",
      description: "Planner, governor, approvals, audit, and safety rails.",
      state: "ACTIVE"
    },
    {
      id: 3,
      name: "Operator console",
      description: "Advanced command center for debugging and emergencies.",
      state: "ACTIVE"
    },
    {
      id: 4,
      name: "External interaction (email/calls/network)",
      description: "Outbound capabilities are wired but locked.",
      state: "LOCKED"
    },
    {
      id: 5,
      name: "Autonomous expansion / agent spawning",
      description: "Implemented but disabled (no execution).",
      state: "DISABLED"
    }
  ];
}
