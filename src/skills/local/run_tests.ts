import * as fs from "node:fs";
import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";

interface RunTestsInput {
  path?: string;
}

interface RunTestsOutput {
  files: string[];
  loaded: number;
  note?: string;
}

function listTestFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(path.join(rootDir, entry.name));
    }
  }
  return files;
}

export const runTestsSkill: SkillDefinition<RunTestsInput, RunTestsOutput> = {
  name: "run_tests",
  description: "Load compiled test modules from dist/tests.",
  inputSchema: {
    type: "object",
    required: [],
    properties: {
      path: {
        type: "string",
        description: "Optional relative path to dist/tests."
      }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "run_tests",
    target: (input) => input.path ?? "dist/tests"
  },
  handler: async (input, context) => {
    if (context.config.killSwitch.enabled) {
      throw new Error("Kill switch enabled.");
    }
    const relativePath =
      typeof input.path === "string" && input.path.trim().length > 0
        ? input.path.trim()
        : path.join("dist", "tests");
    const testsPath = path.resolve(context.config.rootDir, relativePath);
    const files = listTestFiles(testsPath);
    if (files.length === 0) {
      return {
        files: [],
        loaded: 0,
        note: "No test files found in dist/tests."
      };
    }
    const testRunner = require("node:test");
    if (typeof testRunner.run !== "function") {
      throw new Error("Node test runner is not available.");
    }
    const result = testRunner.run({ files });
    if (result && typeof result.then === "function") {
      await result;
    } else if (result && typeof result[Symbol.asyncIterator] === "function") {
      for await (const _ of result) {
        // Consume events for completion.
      }
    }
    return {
      files,
      loaded: files.length
    };
  }
};
