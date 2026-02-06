import * as fs from "node:fs";
import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";

interface AddKnowledgeDocInput {
  path: string;
  content: string;
  allowPii?: boolean;
}

interface AddKnowledgeDocOutput {
  file: string;
  redacted: boolean;
  findings: string[];
}

function resolveKnowledgePath(rootDir: string, inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("path is required.");
  }
  if (path.isAbsolute(inputPath)) {
    throw new Error("Absolute paths are not allowed.");
  }
  const baseDir = path.join(rootDir, "knowledge");
  const resolved = path.resolve(baseDir, inputPath);
  const relative = path.relative(baseDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path must stay within knowledge/.");
  }
  return resolved;
}

export const addKnowledgeDocSkill: SkillDefinition<
  AddKnowledgeDocInput,
  AddKnowledgeDocOutput
> = {
  name: "add_knowledge_doc",
  description: "Add a redacted document to the knowledge vault.",
  inputSchema: {
    type: "object",
    required: ["path", "content"],
    properties: {
      path: { type: "string", description: "Path under knowledge/." },
      content: { type: "string", description: "Document content." },
      allowPii: { type: "boolean", description: "Allow PII in document." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "add_knowledge_doc",
    target: (input) => input.path
  },
  handler: (input, context) => {
    if (!input.content || typeof input.content !== "string") {
      throw new Error("content is required.");
    }
    const allowPii = input.allowPii === true && context.approved;
    const redaction = redactSensitiveText(input.content, { allowPii });
    const targetPath = resolveKnowledgePath(context.config.rootDir, input.path);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, redaction.redactedText, "utf8");
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "knowledge.write",
      approved: context.approved,
      target: path.relative(context.config.rootDir, targetPath),
      result: JSON.stringify({
        redacted: redaction.redacted,
        findings: redaction.findings
      })
    });
    return {
      file: targetPath,
      redacted: redaction.redacted,
      findings: redaction.findings
    };
  }
};
