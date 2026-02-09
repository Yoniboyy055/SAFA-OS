import * as fs from "node:fs";
import * as path from "node:path";

import type { LlmCallInput, LlmCallOutput, LlmModelSpec, LlmProvider } from "../types";
import { listAllModels } from "../registry";

let envLoaded = false;

function loadEnvFromFile(): void {
  if (envLoaded) {
    return;
  }
  envLoaded = true;
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const raw = fs.readFileSync(envPath, "utf8");
  raw.split(/\r?\n/).forEach((line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 0) {
      return;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) {
      return;
    }
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function requireEnv(name: string): string | null {
  loadEnvFromFile();
  const value = process.env[name];
  return value && value.trim().length ? value : null;
}

export class OpenAIProvider implements LlmProvider {
  id = "openai" as const;

  isConfigured(): boolean {
    return Boolean(requireEnv("OPENAI_API_KEY"));
  }

  listModels(): LlmModelSpec[] {
    return listAllModels().filter((model) => model.provider === "openai");
  }

  async call(input: LlmCallInput): Promise<LlmCallOutput> {
    const apiKey = requireEnv("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is missing");
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model.id,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 800
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI call failed: ${res.status} ${text}`);
    }

    const json: any = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? "";
    const usage = json?.usage
      ? {
          inputTokens: json.usage.prompt_tokens,
          outputTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens
        }
      : undefined;

    return { text, usage, raw: json };
  }
}
