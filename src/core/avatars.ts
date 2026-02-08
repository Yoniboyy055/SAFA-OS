export interface AgentAvatar {
  id: string;
  name: string;
  role: string;
  status: "ACTIVE" | "WATCHING" | "LOCKED";
}

export function getAgentAvatars(): AgentAvatar[] {
  return [
    {
      id: "governor",
      name: "Governor",
      role: "Policy enforcement",
      status: "ACTIVE"
    },
    {
      id: "planner",
      name: "Planner",
      role: "Intent planning",
      status: "ACTIVE"
    },
    {
      id: "manager",
      name: "Manager",
      role: "Task coordination",
      status: "ACTIVE"
    },
    {
      id: "operator",
      name: "Operator",
      role: "Local execution",
      status: "WATCHING"
    },
    {
      id: "agent_spawn",
      name: "Agent Spawn",
      role: "Autonomous expansion",
      status: "LOCKED"
    }
  ];
}
