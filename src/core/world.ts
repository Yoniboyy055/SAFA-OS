export interface WorldRoom {
  id: string;
  label: string;
  status: "ACTIVE" | "LOCKED" | "DISABLED";
  description: string;
}

export function getWorldRooms(): WorldRoom[] {
  return [
    {
      id: "audit",
      label: "Audit Gallery",
      status: "ACTIVE",
      description: "Immutable logs and evidence."
    },
    {
      id: "control",
      label: "Systems Core",
      status: "ACTIVE",
      description: "Governance controls and status."
    },
    {
      id: "planner",
      label: "Planning Bay",
      status: "ACTIVE",
      description: "Plans, intents, and approvals."
    },
    {
      id: "ops",
      label: "Operator Console",
      status: "ACTIVE",
      description: "Advanced control surface."
    },
    {
      id: "outbound",
      label: "Outbound Corridor",
      status: "LOCKED",
      description: "External interactions (locked)."
    },
    {
      id: "agents",
      label: "Agent Lab",
      status: "DISABLED",
      description: "Autonomous expansion (disabled)."
    }
  ];
}
