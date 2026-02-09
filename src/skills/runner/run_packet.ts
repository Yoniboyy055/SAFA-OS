import type { SkillDefinition } from "../../types/skill";
import { executePacket } from "../../core/packet_runner";

interface RunPacketInput {
  path: string;
}

interface RunPacketOutput {
  status: string;
  message: string;
}

export const runPacketSkill: SkillDefinition<RunPacketInput, RunPacketOutput> = {
  name: "run_packet",
  description: "Execute a packet (disabled by default).",
  inputSchema: {
    type: "object",
    required: ["path"],
    properties: {
      path: { type: "string", description: "Path to packet file." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "external_tool",
  auditTemplate: {
    action: "run_packet",
    target: (input) => input.path
  },
  handler: async (input, context) => {
    if (!input.path || typeof input.path !== "string") {
      throw new Error("path is required.");
    }
    const result = await executePacket(input.path, context);
    if (result.status !== "SUCCESS") {
      throw new Error(result.message);
    }
    return {
      status: result.status,
      message: result.message
    };
  }
};
