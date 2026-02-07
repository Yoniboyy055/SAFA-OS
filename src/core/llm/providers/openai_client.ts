import * as https from "node:https";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface RunChatInput {
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
}

export interface RunChatResult {
  text: string;
  json?: unknown;
  raw: unknown;
}

function requestJson<T>(path: string, payload: unknown, apiKey: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: "api.openai.com",
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${apiKey}`
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            const parsed = JSON.parse(raw) as T;
            resolve(parsed);
          } catch (error) {
            reject(new Error(`OpenAI response parse failed: ${String(error)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function runChat(input: RunChatInput): Promise<RunChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required.");
  }
  const payload: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    temperature: 0.2
  };
  if (input.jsonMode) {
    payload.response_format = { type: "json_object" };
  }
  const response = await requestJson<any>("/v1/chat/completions", payload, apiKey);
  const text = response?.choices?.[0]?.message?.content ?? "";
  let json: unknown = undefined;
  if (input.jsonMode) {
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = null;
    }
  }
  return { text, json, raw: response };
}
