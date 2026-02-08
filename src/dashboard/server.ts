import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import type { Server } from "http";
import * as path from "node:path";

import { loadConfig } from "../core/config";
import type { ResolvedConfig } from "../core/config";
import { AuditLogger, redactSensitive } from "../core/audit";
import { Governor } from "../core/governor";
import { Planner } from "../core/planner";
import { Manager } from "../core/manager";
import { Operator } from "../core/operator";
import { buildRegistry } from "../skills/registry_factory";
import type { SkillDefinition } from "../types/skill";
import { AuthorityLevel } from "../core/authority";
import type { CostTier, Mode, RiskTier, LlmMessage } from "../core/llm/types";
import { getModel, listAllModels } from "../core/llm/registry";
import { getProvider } from "../core/llm/providers";
import { routeModel } from "../core/llm/router";
import {
  approveRequest,
  createApprovalRequest,
  denyRequest
} from "../core/approvals";
import {
  ApprovalQueueStore,
  type ApprovalQueueRecord
} from "../core/approval_queue_store";
import { ExecutionStore } from "../core/execution_store";
import { readFreezeState } from "../core/freeze";
import type { FreezeState } from "../core/freeze";
import { getLayerDefinitions } from "../core/layers";
import { resolveTheme } from "../core/theme";
import { getWorldRooms } from "../core/world";
import { getAgentAvatars } from "../core/avatars";
import {
  getPhase7bLockMessage,
  isPhase7bLockedSkill
} from "../core/phase7b/locked";
import { redactSensitiveText } from "../core/sensitive";
import { armVr, disarmVr, readVrState } from "../core/vr";
import { parseCommandMode } from "../cli/command_mode";
import { summarizeSAFALine } from "../cli/safa_line";

const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_PORT = 3777;
const HOST = "127.0.0.1";
const STATIC_ROOT = path.resolve(__dirname, "..", "..", "dashboard");
const DEFAULT_ROUTER_MODE: Mode = "auto";
const DEFAULT_ROUTER_MODEL = "gpt-4o-mini";
const DEFAULT_ROUTER_PROVIDER = "openai";
const PIN_DEFAULT = "1234";
const SESSION_COOKIE = "safa_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

interface RuntimeOverrides {
  killSwitchEnabled?: boolean;
  networkEnabled?: boolean;
}

interface DashboardServerOptions {
  configPath?: string;
  actorDefault?: string;
  overrides?: RuntimeOverrides;
  ownerToken?: string;
}

interface RouterDefaults {
  mode: Mode;
  provider: string;
  model: string;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashPayload(value: unknown): string {
  try {
    return hashValue(JSON.stringify(value ?? {}));
  } catch {
    return hashValue(String(value ?? ""));
  }
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
}

function resolveHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function resolvePin(): string {
  const raw = process.env.SAFA_PIN;
  return raw && raw.trim().length > 0 ? raw.trim() : PIN_DEFAULT;
}

function isNetworkLiveDisabled(): boolean {
  return (process.env.SAFA_NETWORK_LIVE ?? "0") === "0";
}

function isLocalAddress(address?: string | null): boolean {
  if (!address) {
    return false;
  }
  if (address === "127.0.0.1" || address === "::1") {
    return true;
  }
  return address.startsWith("::ffff:127.0.0.1");
}

function parseCookies(header?: string): Record<string, string> {
  if (!header) {
    return {};
  }
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) {
      return acc;
    }
    acc[rawKey] = rest.join("=") || "";
    return acc;
  }, {});
}

function signValue(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSessionCookie(secret: string): string {
  const issuedAt = Date.now();
  const payload = {
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signValue(encoded, secret);
  return `${encoded}.${signature}`;
}

function isSessionValid(cookieValue: string | undefined, secret: string): boolean {
  if (!cookieValue) {
    return false;
  }
  const [encoded, signature] = cookieValue.split(".");
  if (!encoded || !signature) {
    return false;
  }
  if (signValue(encoded, secret) !== signature) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload?.exp !== "number") {
      return false;
    }
    return Date.now() <= payload.exp;
  } catch {
    return false;
  }
}

function resolveAuthority(value?: string): AuthorityLevel | undefined {
  if (!value) {
    return undefined;
  }
  return value.toUpperCase() === AuthorityLevel.OWNER ? AuthorityLevel.OWNER : undefined;
}

function ensureFlag(args: string[], flag: string, value?: string): void {
  if (!value) {
    return;
  }
  if (!args.includes(flag)) {
    args.push(flag, value);
  }
}

function ensureBooleanFlag(args: string[], flag: string, enabled: boolean): void {
  const index = args.indexOf(flag);
  if (enabled && index === -1) {
    args.push(flag);
  }
  if (!enabled && index !== -1) {
    args.splice(index, 1);
  }
}

function extractInputFromArgs(args: string[]): Record<string, unknown> {
  const raw = getFlagValue(args, "--input");
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function updateInputArg(args: string[], input: Record<string, unknown>): void {
  const index = args.indexOf("--input");
  const payload = JSON.stringify(input ?? {});
  if (index === -1) {
    args.push("--input", payload);
    return;
  }
  if (index + 1 < args.length) {
    args[index + 1] = payload;
  }
}

function applyRuntimeOverrides(
  base: ResolvedConfig,
  overrides: RuntimeOverrides
): ResolvedConfig {
  return {
    ...base,
    killSwitch: {
      ...base.killSwitch,
      enabled:
        typeof overrides.killSwitchEnabled === "boolean"
          ? overrides.killSwitchEnabled
          : base.killSwitch.enabled
    },
    network: {
      ...base.network,
      enabled:
        typeof overrides.networkEnabled === "boolean"
          ? overrides.networkEnabled
          : base.network.enabled
    }
  } as ResolvedConfig;
}

function resolveActor(payload: Record<string, unknown>, fallback: string): string {
  if (typeof payload.actor === "string" && payload.actor.trim().length > 0) {
    return payload.actor.trim();
  }
  return fallback;
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("Payload too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".css") {
    return "text/css";
  }
  if (ext === ".js") {
    return "application/javascript";
  }
  if (ext === ".html") {
    return "text/html";
  }
  if (ext === ".json") {
    return "application/json";
  }
  return "text/plain";
}

function serveStatic(res: http.ServerResponse, urlPath: string): boolean {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const resolved = path.resolve(STATIC_ROOT, "." + safePath);
  if (!resolved.startsWith(STATIC_ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return true;
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    return false;
  }
  const content = fs.readFileSync(resolved);
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypeFor(resolved));
  res.end(content);
  return true;
}

function parseJsonBody(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) {
    return {};
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

function loadVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function buildRuntimeConfig(
  configPath: string | undefined,
  overrides: RuntimeOverrides
): ResolvedConfig {
  const base = loadConfig(configPath);
  const config: ResolvedConfig = {
    ...base,
    killSwitch: { ...base.killSwitch },
    network: { ...base.network }
  } as ResolvedConfig;
  if (typeof overrides.killSwitchEnabled === "boolean") {
    config.killSwitch.enabled = overrides.killSwitchEnabled;
  }
  if (typeof overrides.networkEnabled === "boolean") {
    config.network.enabled = overrides.networkEnabled;
  }
  return config;
}

function buildAllowWhenNetworkOff(
  skill: SkillDefinition,
  input: Record<string, unknown>
): boolean {
  return (
    skill.allowWhenNetworkOff ||
    (["send_email", "request_payment", "make_call"].includes(skill.name) &&
      input.dryRun === true)
  );
}

function resolveRouterDefaults(): RouterDefaults {
  const modeRaw = process.env.ROUTER_DEFAULT_MODE;
  const modelRaw = process.env.ROUTER_DEFAULT_MODEL;
  const mode: Mode = modeRaw === "manual" ? "manual" : DEFAULT_ROUTER_MODE;
  const raw = typeof modelRaw === "string" && modelRaw.trim().length > 0 ? modelRaw.trim() : "";
  if (raw.includes(":")) {
    const [provider, model] = raw.split(":", 2);
    return {
      mode,
      provider: provider || DEFAULT_ROUTER_PROVIDER,
      model: model || DEFAULT_ROUTER_MODEL
    };
  }
  return {
    mode,
    provider: DEFAULT_ROUTER_PROVIDER,
    model: raw || DEFAULT_ROUTER_MODEL
  };
}

function normalizeRouterInput(
  body: Record<string, unknown>,
  defaults: RouterDefaults,
  commandText: string,
  skill?: string,
  approvalRequired?: boolean
) {
  const mode: Mode = body.routerMode === "manual" || body.routerMode === "auto" ? (body.routerMode as Mode) : defaults.mode;
  const manualProvider = typeof body.manualProvider === "string" ? body.manualProvider : defaults.provider;
  const manualModel = typeof body.manualModel === "string" ? body.manualModel : defaults.model;
  const budget: CostTier = body.budget === "normal" || body.budget === "high" ? (body.budget as CostTier) : "low";
  const risk: RiskTier =
    body.risk === "guarded" || body.risk === "high"
      ? (body.risk as RiskTier)
      : approvalRequired
        ? "guarded"
        : "safe";
  return {
    mode,
    manualProvider,
    manualModel,
    budget,
    risk,
    commandText,
    skill
  };
}

function buildNetworkRequest(
  skill: SkillDefinition,
  input: Record<string, unknown>
): import("../core/network/types").NetworkRequest | undefined {
  if (skill.category !== "network") {
    return undefined;
  }
  const url = input.url;
  const method = input.method;
  if (typeof url !== "string" || typeof method !== "string") {
    return undefined;
  }
  return {
    id: `net-${Date.now()}`,
    purpose: typeof input.purpose === "string" ? input.purpose : skill.name,
    method,
    url,
    headers:
      input.headers && typeof input.headers === "object"
        ? (input.headers as Record<string, string>)
        : {},
    bodySummary: typeof input.body === "string" ? input.body : "",
    bodyHash: "",
    riskLevel: skill.riskLevel,
    requiresApproval: skill.requiresApproval
  };
}
function summarizeApproval(action: string, target: string): string {
  return `${action} -> ${target}`;
}

function createPendingApproval(
  queue: ApprovalQueueStore,
  audit: AuditLogger,
  actor: string,
  key: string,
  action: string,
  target: string,
  payload?: unknown
): ApprovalQueueRecord {
  const request = createApprovalRequest(
    { action, target, payload },
    { actor, audit }
  );
  const record: ApprovalQueueRecord = {
    request,
    status: request.status,
    key,
    summary: summarizeApproval(action, target)
  };
  return queue.upsert(record);
}

function resolveSkillAvailability(
  skill: SkillDefinition,
  config: ResolvedConfig
): { state: "ENABLED" | "DISABLED" | "LOCKED"; enabled: boolean; lockReason?: string } {
  if (isPhase7bLockedSkill(skill.name)) {
    return {
      state: "LOCKED",
      enabled: false,
      lockReason: `Capability Present — Locked (${getPhase7bLockMessage()})`
    };
  }
  if (skill.name === "run_packet" && !config.execution.enabled) {
    return { state: "DISABLED", enabled: false, lockReason: "Execution disabled." };
  }
  if (skill.category === "network" && !config.network.enabled) {
    return { state: "DISABLED", enabled: false, lockReason: "Network disabled." };
  }
  if (skill.name === "send_email" && !config.email.enabled) {
    return { state: "DISABLED", enabled: false, lockReason: "Email disabled." };
  }
  if (skill.name === "make_call" && !config.calls.enabled) {
    return { state: "DISABLED", enabled: false, lockReason: "Calls disabled." };
  }
  if (skill.name === "request_payment" && !config.stripe.enabled) {
    return { state: "DISABLED", enabled: false, lockReason: "Stripe disabled." };
  }
  return { state: "ENABLED", enabled: true };
}

function resolveSkillLayer(skill: SkillDefinition): number {
  if (skill.name === "analyze_input_risk") {
    return 2;
  }
  if (
    skill.category === "network" ||
    skill.category === "external_tool" ||
    skill.category === "outbound_message"
  ) {
    return 4;
  }
  return 3;
}

function safeUrlSummary(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "url";
  }
}

function summarizeTouchedTargets(
  skillName: string,
  input: Record<string, unknown>
): string[] {
  const touched: string[] = [];
  if (typeof input.path === "string") {
    touched.push(`path:${input.path}`);
  }
  if (typeof input.url === "string") {
    touched.push(`url:${safeUrlSummary(input.url)}`);
  }
  if (input.to || input.customerEmail || input.from) {
    touched.push("email:[redacted]");
  }
  if (input.toNumber || input.fromNumber) {
    touched.push("phone:[redacted]");
  }
  if (skillName === "freeze_system") {
    touched.push("system:freeze");
  }
  if (skillName === "unfreeze_system") {
    touched.push("system:unfreeze");
  }
  return touched;
}

function sanitizeArgv(argv: string[]): string[] {
  const sanitized = [...argv];
  const inputIndex = sanitized.indexOf("--input");
  if (inputIndex !== -1 && inputIndex + 1 < sanitized.length) {
    sanitized[inputIndex + 1] = "[REDACTED]";
  }
  return sanitized;
}

function redactOutput(
  value: unknown,
  redactKeys: string[]
): { redacted: unknown; hadSecrets: boolean; hadPii: boolean } {
  const keys = new Set(redactKeys.map((entry) => entry.toLowerCase()));
  let hadSecrets = false;
  let hadPii = false;

  if (typeof value === "string") {
    const result = redactSensitiveText(value, {
      allowPii: false,
      redactKeys
    });
    hadSecrets = hadSecrets || result.hadSecrets;
    hadPii = hadPii || result.hadPii;
    return { redacted: result.redactedText, hadSecrets, hadPii };
  }

  if (value === null || value === undefined) {
    return { redacted: value, hadSecrets, hadPii };
  }

  if (Array.isArray(value)) {
    const redactedArray = value.map((item) => {
      const result = redactOutput(item, redactKeys);
      hadSecrets = hadSecrets || result.hadSecrets;
      hadPii = hadPii || result.hadPii;
      return result.redacted;
    });
    return { redacted: redactedArray, hadSecrets, hadPii };
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (keys.has(key.toLowerCase())) {
        output[key] = "[REDACTED]";
        hadSecrets = true;
        continue;
      }
      const result = redactOutput(entry, redactKeys);
      output[key] = result.redacted;
      hadSecrets = hadSecrets || result.hadSecrets;
      hadPii = hadPii || result.hadPii;
    }
    return { redacted: output, hadSecrets, hadPii };
  }

  return { redacted: value, hadSecrets, hadPii };
}
type ChatIntent =
  | { type: "status" }
  | { type: "skills" }
  | { type: "plan"; task: string }
  | { type: "execute"; skill: string; input: Record<string, unknown> }
  | { type: "approve_pending" }
  | { type: "cancel_pending" }
  | { type: "model" };

interface ChatSessionState {
  pending?: {
    skill: string;
    input: Record<string, unknown>;
    createdAt: string;
    description: string;
  };
}

function normalizeChatText(input: string): string {
  return input.trim();
}

function resolveSessionId(raw?: string): { id: string; created: boolean } {
  const cleaned = (raw ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48);
  if (cleaned) {
    return { id: cleaned, created: false };
  }
  const generated = `sess-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return { id: generated, created: true };
}

function resolveChatSessionPath(rootDir: string, sessionId: string): string {
  return path.resolve(
    rootDir,
    "data",
    "control",
    "chat_sessions",
    `session_${sessionId}.json`
  );
}

function readChatSession(rootDir: string, sessionId: string): ChatSessionState {
  const sessionPath = resolveChatSessionPath(rootDir, sessionId);
  if (!fs.existsSync(sessionPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(sessionPath, "utf8")) as ChatSessionState;
  } catch {
    return {};
  }
}

function writeChatSession(
  rootDir: string,
  sessionId: string,
  state: ChatSessionState
): void {
  const sessionPath = resolveChatSessionPath(rootDir, sessionId);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2), "utf8");
}

function clearChatSession(rootDir: string, sessionId: string): void {
  writeChatSession(rootDir, sessionId, {});
}

function buildChatEvidence(params: {
  action: string;
  decision: string;
  touched: string[];
  recommendation: string;
}): string {
  const touched =
    params.touched.length > 0 ? params.touched.join(", ") : "None";
  return [
    `What happened: ${params.action}`,
    `Why: ${params.decision}`,
    `What it touched: ${touched}`,
    `Recommended next: ${params.recommendation}`
  ].join("\n");
}

function classifyChatIntent(message: string, pending?: ChatSessionState["pending"]): ChatIntent {
  const text = normalizeChatText(message);
  const lowered = text.toLowerCase();
  const approveWords = ["yes", "approve", "go ahead", "do it", "proceed"];
  const denyWords = ["no", "cancel", "stop", "never mind"];

  if (pending) {
    if (approveWords.some((word) => lowered === word)) {
      return { type: "approve_pending" };
    }
    if (denyWords.some((word) => lowered === word)) {
      return { type: "cancel_pending" };
    }
  }

  if (lowered.includes("status")) {
    return { type: "status" };
  }
  if (lowered.includes("skills")) {
    return { type: "skills" };
  }
  if (lowered.startsWith("help me plan") || lowered.startsWith("plan")) {
    const task = text.replace(/^(help me plan|plan)\s*/i, "").trim();
    return { type: "plan", task: task || text };
  }
  if (lowered.includes("list files") || lowered.includes("show files")) {
    return { type: "execute", skill: "list_files", input: { path: ".", recursive: false } };
  }
  if (lowered.startsWith("search")) {
    const query = text.replace(/^search\s*(for)?\s*/i, "").trim();
    return { type: "execute", skill: "search_text", input: { path: ".", query } };
  }
  const readMatch = text.match(/^(read|open|show)\s+([^\s]+)$/i);
  if (readMatch) {
    return {
      type: "execute",
      skill: "read_file",
      input: { path: readMatch[2] }
    };
  }
  if (lowered.includes("calendar")) {
    return { type: "model" };
  }

  return { type: "model" };
}

function hashChatText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function formatChatOutput(output: unknown): string {
  if (output === null || output === undefined) {
    return "No output.";
  }
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (!trimmed) {
      return "No output.";
    }
    return trimmed.length > 800 ? `${trimmed.slice(0, 800)}…` : trimmed;
  }
  return "Action completed. Output is available in the operator console.";
}

async function generateChatModelReply(
  text: string,
  defaults: RouterDefaults,
  audit: AuditLogger,
  actor: string,
  sessionId: string,
  redactKeys: string[]
): Promise<{ message: string; modelUsed: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }
  const routerInput = normalizeRouterInput({}, defaults, text);
  const policy = routeModel(routerInput);
  const provider = getProvider(policy.model.provider);
  if (!provider) {
    throw new Error(`Provider ${policy.model.provider} is not configured.`);
  }
  const modelSpec = getModel(policy.model.provider as "openai", policy.model.id);
  if (!modelSpec) {
    throw new Error("Model not available.");
  }
  const messages: LlmMessage[] = [
    {
      role: "system",
      content:
        "You are SAFA OS. Provide direct, factual, neutral responses. Avoid anthropomorphic language or emotional claims."
    },
    { role: "user", content: text }
  ];
  const output = await provider.call({
    model: modelSpec,
    messages,
    temperature: 0.7,
    maxTokens: 500
  });
  const redaction = redactSensitiveText(output.text ?? "", {
    allowPii: false,
    redactKeys
  });
  audit.log({
    timestamp: new Date().toISOString(),
    actor,
    action: "dashboard.chat.model",
    approved: false,
    target: `${policy.model.provider}:${policy.model.id}`,
    result: JSON.stringify({
      sessionId,
      preview: redaction.redactedText.slice(0, 160),
      redacted: redaction.redacted
    })
  });
  return {
    message: output.text?.trim() || "No output.",
    modelUsed: `${policy.model.provider}:${policy.model.id}`
  };
}

function renderPinLockUi(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAFA OS Lock</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Segoe UI", "Inter", system-ui, sans-serif;
      background: radial-gradient(circle at top, #111827 0%, #030712 60%);
      color: #e2e8f0;
    }
    .lock-card {
      width: min(420px, 90vw);
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      display: grid;
      gap: 16px;
    }
    .lock-title {
      font-size: 20px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .lock-subtitle {
      font-size: 14px;
      color: #94a3b8;
    }
    .lock-input {
      display: grid;
      gap: 8px;
    }
    input[type="password"] {
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.3);
      background: rgba(2, 6, 23, 0.8);
      color: #e2e8f0;
      font-size: 16px;
    }
    button {
      padding: 12px 14px;
      border-radius: 10px;
      border: none;
      background: #2563eb;
      color: #f8fafc;
      font-weight: 600;
      cursor: pointer;
    }
    .error {
      color: #fca5a5;
      font-size: 13px;
      min-height: 16px;
    }
  </style>
</head>
<body>
  <div class="lock-card" id="pin-screen">
    <div class="lock-title">PIN Lock</div>
    <div class="lock-subtitle">Enter PIN to unlock SAFA OS.</div>
    <div class="lock-input">
      <label for="pinInput">PIN</label>
      <input id="pinInput" type="password" placeholder="Enter PIN" autocomplete="off" />
    </div>
    <button id="unlockBtn">Unlock</button>
    <div class="error" id="lockError"></div>
  </div>
  <script>
    const button = document.getElementById("unlockBtn");
    const input = document.getElementById("pinInput");
    const error = document.getElementById("lockError");
    async function unlock() {
      const pin = input.value.trim();
      error.textContent = "";
      const res = await fetch("/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      error.textContent = data?.reason || "Unauthorized.";
    }
    button.addEventListener("click", unlock);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        unlock();
      }
    });
  </script>
</body>
</html>`;
}

function renderDashboardUi(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAFA OS</title>
  <style>
    body {
      font-family: "Segoe UI", "Inter", system-ui, sans-serif;
      background: radial-gradient(circle at top, #1f2937 0%, #0b1020 45%, #020617 100%);
      color: #e6e6e6;
      margin: 0;
      min-height: 100vh;
      position: relative;
      overflow: hidden;
      --accent: #60a5fa;
      --glow: rgba(96, 165, 250, 0.35);
    }
    body[data-theme="freeze"] { --accent: #f97316; --glow: rgba(251, 146, 60, 0.4); }
    body[data-theme="warning"] { --accent: #facc15; --glow: rgba(250, 204, 21, 0.35); }
    body[data-theme="offline"] { --accent: #94a3b8; --glow: rgba(148, 163, 184, 0.35); }
    .ambient {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }
    .ambient::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
      background-size: 80px 80px;
      opacity: 0.35;
    }
    .orb {
      position: absolute;
      width: 420px;
      height: 420px;
      border-radius: 50%;
      filter: blur(60px);
      opacity: 0.35;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.65), rgba(15, 23, 42, 0));
      animation: float 18s ease-in-out infinite;
    }
    .orb.orb-2 {
      width: 520px;
      height: 520px;
      right: -120px;
      top: 10%;
      background: radial-gradient(circle, rgba(14, 165, 233, 0.55), rgba(15, 23, 42, 0));
      animation-duration: 22s;
    }
    .orb.orb-3 {
      width: 380px;
      height: 380px;
      left: 10%;
      bottom: -120px;
      background: radial-gradient(circle, rgba(217, 70, 239, 0.45), rgba(15, 23, 42, 0));
      animation-duration: 24s;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-24px); }
    }
    header {
      padding: 24px 32px;
      background: rgba(10, 15, 28, 0.65);
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
      position: sticky;
      top: 0;
      backdrop-filter: blur(18px);
      z-index: 10;
    }
    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    h1 { margin: 0; font-size: 26px; letter-spacing: 3px; }
    .subtitle {
      color: #94a3b8;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-top: 6px;
    }
    .banner {
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid #334155;
      color: #cbd5f5;
      background: rgba(30, 41, 59, 0.7);
    }
    .banner.safe {
      border-color: var(--accent);
      color: var(--accent);
      background: rgba(37, 99, 235, 0.15);
    }
    main { padding: 24px 32px; display: grid; gap: 16px; min-height: calc(100vh - 140px); position: relative; z-index: 1; }
    .card {
      background: linear-gradient(135deg, rgba(17, 24, 39, 0.7), rgba(15, 23, 42, 0.45));
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 14px;
      padding: 16px;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 18px 40px rgba(2, 6, 23, 0.45);
      backdrop-filter: blur(18px);
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 22px 45px rgba(2, 6, 23, 0.55); }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
    .status-grid { display: grid; gap: 6px; margin-top: 8px; font-size: 13px; }
    .badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #0b1220;
      border: 1px solid #1f2937;
      font-size: 12px;
      color: #e2e8f0;
    }
    .badge.safe { border-color: var(--accent); color: var(--accent); }
    .badge.locked { border-color: #f97316; color: #fdba74; }
    .badge.disabled { border-color: #64748b; color: #cbd5f5; }
    textarea, input, select {
      width: 100%;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #334155;
      background: #0b1220;
      color: #e5e7eb;
    }
    button {
      background: var(--accent);
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.2s ease;
    }
    button:hover { transform: translateY(-1px); box-shadow: 0 6px 16px var(--glow); }
    button:disabled { background: #4b5563; box-shadow: none; }
    button.secondary { background: #0b1220; border: 1px solid #334155; color: #e2e8f0; }
    button.danger { background: #dc2626; }
    .control-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    pre { background: #0b1220; padding: 12px; border-radius: 8px; overflow: auto; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; background: #1f2937; }
    .feed { max-height: 220px; overflow: auto; display: grid; gap: 8px; }
    .feed-item { padding: 8px; border-radius: 8px; background: rgba(15, 23, 42, 0.7); font-size: 12px; border: 1px solid rgba(148, 163, 184, 0.2); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid rgba(148, 163, 184, 0.2); font-size: 13px; }
    th { color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
    .state-pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; border: 1px solid; }
    .state-enabled { border-color: #10b981; color: #6ee7b7; }
    .state-locked { border-color: #f97316; color: #fdba74; }
    .state-disabled { border-color: #64748b; color: #cbd5f5; }
    .hidden { display: none; }
    .chat-shell { display: grid; gap: 16px; height: calc(100vh - 160px); }
    .chat-feed { flex: 1; display: grid; gap: 12px; overflow: auto; padding-right: 4px; }
    .chat-message { padding: 12px 16px; border-radius: 16px; max-width: 720px; line-height: 1.6; backdrop-filter: blur(12px); }
    .chat-message.user { margin-left: auto; background: rgba(37, 99, 235, 0.25); border: 1px solid rgba(59, 130, 246, 0.45); }
    .chat-message.assistant { background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(148, 163, 184, 0.2); }
    .chat-input { display: flex; gap: 12px; align-items: center; }
    .chat-input input { flex: 1; }
    .status-line { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #94a3b8; }
    .status-line span { display: inline-flex; gap: 6px; align-items: center; }
    .status-dot { width: 8px; height: 8px; border-radius: 999px; background: #22c55e; }
    .status-dot.offline { background: #f97316; }
    .chat-card { height: 100%; display: grid; grid-template-rows: auto 1fr auto; gap: 12px; }
    .operator-shell { display: grid; grid-template-columns: 72px 1fr; gap: 16px; }
    .operator-nav {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px 8px;
      border-radius: 18px;
      background: rgba(12, 18, 32, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.2);
      backdrop-filter: blur(18px);
      height: fit-content;
    }
    .nav-logo {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(37, 99, 235, 0.25);
      border: 1px solid rgba(59, 130, 246, 0.4);
      display: grid;
      place-items: center;
      font-weight: 700;
      color: var(--accent);
      margin: 0 auto 6px;
    }
    .nav-item {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(15, 23, 42, 0.6);
      color: #e2e8f0;
      font-size: 12px;
      margin: 0 auto;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .nav-item:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px var(--glow);
    }
    .nav-item.active {
      border-color: var(--accent);
      color: var(--accent);
      box-shadow: 0 0 12px var(--glow);
    }
    .operator-content { display: grid; gap: 16px; }
    .world-map {
      display: grid;
      gap: 8px;
      padding: 12px;
      border-radius: 12px;
      background: rgba(11, 18, 32, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.2);
      transform: perspective(900px) rotateX(8deg);
    }
    .world-node {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.18);
      background: rgba(15, 23, 42, 0.7);
      font-size: 12px;
    }
    .world-node.active { border-color: rgba(56, 189, 248, 0.4); box-shadow: 0 0 12px var(--glow); }
    .world-node.locked { opacity: 0.7; }
    .world-node.disabled { opacity: 0.45; }
    .portal-btn {
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(30, 41, 59, 0.7);
      color: #e2e8f0;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 10px;
      cursor: pointer;
    }
    .portal-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
      box-shadow: 0 0 10px var(--glow);
    }
    .avatar-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    .avatar-card {
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(15, 23, 42, 0.7);
    }
    .avatar-card.active { border-color: var(--accent); box-shadow: 0 0 12px var(--glow); }
    .avatar-card.watching { border-color: rgba(250, 204, 21, 0.5); }
    .avatar-card.locked { border-color: rgba(248, 113, 113, 0.5); opacity: 0.7; }
    .avatar-name { font-weight: 600; margin-bottom: 4px; }
    .avatar-role { font-size: 12px; color: #94a3b8; }
    .avatar-status { font-size: 11px; color: var(--accent); margin-top: 6px; }
    .scene-canvas {
      width: 100%;
      height: 220px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(9, 14, 28, 0.7);
    }
    .risk-low { color: #6ee7b7; }
    .risk-medium { color: #facc15; }
    .risk-high { color: #f87171; }
    .zone { display: grid; gap: 16px; opacity: 1; transform: translateY(0); transition: opacity 0.2s ease, transform 0.2s ease; }
    .zone.hidden { opacity: 0; transform: translateY(8px); pointer-events: none; height: 0; overflow: hidden; }
    .timeline {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 10px;
    }
    .timeline-node {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: rgba(148, 163, 184, 0.5);
      border: 1px solid rgba(148, 163, 184, 0.35);
    }
    .timeline-node.active { background: var(--accent); box-shadow: 0 0 8px var(--glow); }
    .timeline-line {
      flex: 1;
      height: 2px;
      background: rgba(148, 163, 184, 0.3);
    }
    .accessibility-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .high-contrast .card {
      border-color: rgba(255, 255, 255, 0.45);
      background: rgba(15, 23, 42, 0.8);
    }
    .large-text { font-size: 110%; }
    .reduce-motion * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
  </style>
</head>
  <body>
  <div class="ambient">
    <div class="orb"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>
  <header>
    <div class="header-row">
      <div>
        <h1>SAFA OS</h1>
        <div class="subtitle">Governed Command Center</div>
      </div>
      <div style="display:flex; gap:12px; align-items:center;">
        <div id="safeBanner" class="banner">SAFE MODE — Kill Switch Enabled</div>
        <button id="toggleOperator" class="secondary">Operator Console</button>
      </div>
    </div>
  </header>
  <main>
    <section id="chatView" class="chat-shell">
      <div class="card chat-card">
        <div>
          <div class="label">Conversation</div>
          <div class="status-line" id="chatStatus">
            <span><span class="status-dot offline"></span>Offline (Local)</span>
            <span>Kill Switch: <strong>ON</strong></span>
            <span>Network: <strong>OFF</strong></span>
          </div>
        </div>
        <div class="chat-feed" id="chatFeed"></div>
        <div class="chat-input">
          <input id="chatInput" placeholder="What would you like to work on?" />
          <button id="chatSendBtn">Send</button>
        </div>
      </div>
    </section>
    <section id="operatorView" class="hidden">
    <div class="operator-shell">
      <nav class="operator-nav">
        <div class="nav-logo">J</div>
        <div class="nav-item" data-zone="home">HOME</div>
        <div class="nav-item" data-zone="systems">SYS</div>
        <div class="nav-item" data-zone="vr">VR</div>
        <div class="nav-item" data-zone="ops">OPS</div>
        <div class="nav-item" data-zone="audit">AUD</div>
      </nav>
      <div class="operator-content">
        <div class="zone" data-zone="home">
          <div class="grid">
            <div class="card">
              <div class="label">Status Core</div>
              <div class="status-grid" id="status">Loading...</div>
              <div class="badge-row" id="statusBadges"></div>
              <div class="control-row">
                <button id="freezeBtn" class="danger">Freeze System</button>
                <button id="unfreezeBtn" class="secondary">Unfreeze</button>
              </div>
            </div>
            <div class="card">
              <div class="label">Evidence & Audit</div>
              <div class="badge-row">
                <span class="badge safe">Evidence Mode: ON</span>
                <span class="badge safe">Shadow Run: ON</span>
                <span class="badge">Audit Logs: Redacted</span>
              </div>
              <div style="margin-top:10px; font-size:12px; color:#94a3b8;">
                Every command is logged with redaction markers. No secrets are exposed.
              </div>
            </div>
          </div>
          <div class="card">
            <div class="label">Skill Matrix</div>
            <div id="skills">Loading...</div>
          </div>
          <div class="grid">
            <div class="card">
              <div class="label">World Wireframe</div>
              <div id="worldMap" class="world-map"></div>
              <div class="timeline">
                <div class="timeline-node active"></div>
                <div class="timeline-line"></div>
                <div class="timeline-node"></div>
                <div class="timeline-line"></div>
                <div class="timeline-node"></div>
              </div>
            </div>
            <div class="card">
              <div class="label">Agent Avatars</div>
              <div id="avatarGrid" class="avatar-grid"></div>
            </div>
          </div>
        </div>
        <div class="zone hidden" data-zone="systems">
          <div class="grid">
            <div class="card">
              <div class="label">Model Router (Advisory)</div>
              <div class="status-grid">
                <div>Local models preferred</div>
                <div>Cloud adapters: LOCKED</div>
                <div>Auto-route: Disabled</div>
              </div>
            </div>
            <div class="card">
              <div class="label">Voice Bridge</div>
              <div class="status-grid">
                <div>Parsing: ENABLED</div>
                <div>Audio capture: DISABLED</div>
                <div>Approval gates: ON</div>
              </div>
            </div>
          </div>
          <div class="grid">
            <div class="card">
              <div class="label">Business Ops</div>
              <div class="status-grid">
                <div>Client intake: Preview only</div>
                <div>Negotiation: Preview only</div>
                <div>Follow-up: Preview only</div>
              </div>
            </div>
            <div class="card">
              <div class="label">Accessibility</div>
              <div class="status-grid">
                <label class="accessibility-toggle">
                  <input type="checkbox" id="reduceMotionToggle" /> Reduce motion
                </label>
                <label class="accessibility-toggle">
                  <input type="checkbox" id="highContrastToggle" /> High contrast
                </label>
                <label class="accessibility-toggle">
                  <input type="checkbox" id="largeTextToggle" /> Large text
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="zone hidden" data-zone="vr">
          <div class="grid">
            <div class="card">
              <div class="label">VR Control</div>
              <div id="vrStatus" class="status-grid">Loading...</div>
              <div class="badge-row" style="margin-top:8px;">
                <span class="badge safe">VR Module: Enabled</span>
                <span class="badge">Hardware: Disarmed by default</span>
              </div>
              <div class="control-row">
                <label class="badge">
                  <input type="checkbox" id="vrOverrideCheck" />
                  Override Kill Switch (VR only)
                </label>
              </div>
              <div class="control-row">
                <button id="vrArmBtn">Arm VR</button>
                <button id="vrDisarmBtn" class="secondary">Disarm VR</button>
              </div>
            </div>
            <div class="card">
              <div class="label">3D / VR Pipeline</div>
              <div class="pill">Scaffold Active (No heavy render)</div>
              <div style="margin-top:10px; font-size:12px; color:#94a3b8;">
                Three.js placeholder ready. No device calls until VR is armed.
              </div>
            </div>
          </div>
          <div class="card">
            <div class="label">Immersive Preview</div>
            <canvas id="sceneCanvas" class="scene-canvas"></canvas>
            <div class="pill" style="margin-top:8px;">2.5D scaffold</div>
          </div>
        </div>
        <div class="zone hidden" data-zone="ops">
          <div class="card">
            <div class="label">Command Console (Governed)</div>
            <textarea id="commandInput" rows="4" placeholder="SAFA: STATUS"></textarea>
            <div class="grid" style="margin-top:12px;">
              <div>
                <label class="label">Mode</label>
                <select id="modeSelect">
                  <option value="SCRIPT">SCRIPT</option>
                  <option value="CREATE">CREATE</option>
                  <option value="BUILD">BUILD</option>
                  <option value="DECIDE">DECIDE</option>
                  <option value="CLARIFY">CLARIFY</option>
                </select>
              </div>
              <div>
                <label class="label">Authority</label>
                <select id="authoritySelect">
                  <option value="OWNER">OWNER</option>
                </select>
              </div>
              <div>
                <label class="label">Approve</label>
                <input type="checkbox" id="approveCheck" />
              </div>
              <div>
                <label class="label">Dry-Run</label>
                <input type="checkbox" id="dryRunCheck" checked />
              </div>
              <div>
                <label class="label">Evidence Mode</label>
                <input type="checkbox" id="evidenceCheck" checked />
              </div>
              <div>
                <label class="label">Shadow Run</label>
                <input type="checkbox" id="shadowCheck" checked />
              </div>
            </div>
            <button id="sendBtn" style="margin-top:12px;">Send (Dry-Run)</button>
          </div>
          <div class="grid">
            <div class="card">
              <div class="label">Parsed Packet</div>
              <pre id="packetPanel">{}</pre>
            </div>
            <div class="card">
              <div class="label">Governor Decision</div>
              <pre id="decisionPanel">{}</pre>
            </div>
          </div>
          <div class="card">
            <div class="label">Evidence Panel</div>
            <pre id="evidencePanel">{}</pre>
          </div>
        </div>
        <div class="zone hidden" data-zone="audit">
          <div class="card">
            <div class="label">Activity / Audit Feed</div>
            <div class="feed" id="auditFeed"></div>
          </div>
          <div class="card">
            <div class="label">Response</div>
            <pre id="responsePanel">{}</pre>
          </div>
        </div>
      </div>
    </div>
    </section>
  </main>
  <script>
    const chatSessionKey = "safa_chat_session";
    function getChatSessionId() {
      const stored = localStorage.getItem(chatSessionKey);
      if (stored) {
        return stored;
      }
      const fresh = "sess-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8);
      localStorage.setItem(chatSessionKey, fresh);
      return fresh;
    }
    function setChatSessionId(value) {
      if (value) {
        localStorage.setItem(chatSessionKey, value);
      }
    }
    function appendChatMessage(text, role) {
      const feed = document.getElementById("chatFeed");
      const bubble = document.createElement("div");
      bubble.className = "chat-message " + role;
      bubble.textContent = text;
      feed.appendChild(bubble);
      feed.scrollTop = feed.scrollHeight;
    }
    function greeting() {
      const hour = new Date().getHours();
      const period =
        hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
      return (
        "Good " +
        period +
        ". I'm offline right now. What would you like to work on?"
      );
    }
    function renderBadge(label, className) {
      const span = document.createElement("span");
      span.className = "badge " + (className || "");
      span.textContent = label;
      return span;
    }
    function renderWorldMap(rooms) {
      const container = document.getElementById("worldMap");
      if (!container) {
        return;
      }
      const zoneMap = {
        audit: "audit",
        control: "systems",
        planner: "home",
        ops: "ops",
        outbound: "systems"
      };
      const rows = (rooms || []).map((room) => {
        const zone = zoneMap[room.id];
        const portal = zone
          ? '<button class="portal-btn" data-zone="' + zone + '">Portal</button>'
          : "<span></span>";
        return (
          '<div class="world-node ' +
          room.status.toLowerCase() +
          '">' +
          "<span>" +
          room.label +
          "</span>" +
          "<span>" +
          room.status +
          "</span>" +
          portal +
          "</div>"
        );
      }).join("");
      container.innerHTML = rows || "<div class='world-node'>No rooms loaded.</div>";
      container.querySelectorAll(".portal-btn").forEach((button) => {
        button.addEventListener("click", () => {
          const target = button.dataset.zone || "home";
          setZone(target);
        });
      });
    }
    function renderAvatars(avatars) {
      const container = document.getElementById("avatarGrid");
      if (!container) {
        return;
      }
      const cards = (avatars || []).map((avatar) => {
        const statusClass = avatar.status ? avatar.status.toLowerCase() : "";
        const boundary = avatar.status === "LOCKED" ? "LOCKED" : "GOVERNED";
        return (
          '<div class="avatar-card ' +
          statusClass +
          '">' +
          '<div class="avatar-name">' +
          avatar.name +
          "</div>" +
          '<div class="avatar-role">' +
          avatar.role +
          "</div>" +
          '<div class="avatar-status">' +
          avatar.status +
          "</div>" +
          '<div class="avatar-status">Boundary: ' +
          boundary +
          "</div>" +
          "</div>"
        );
      }).join("");
      container.innerHTML = cards || "<div class='avatar-card'>No avatars loaded.</div>";
    }
    function drawScene(rooms) {
      const canvas = document.getElementById("sceneCanvas");
      if (!canvas || !canvas.getContext) {
        return;
      }
      const ctx = canvas.getContext("2d");
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(96, 165, 250, 0.2)";
      ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
      ctx.lineWidth = 1;
      const nodes = (rooms || []).map((room, index) => ({
        label: room.label,
        x: 40 + (index % 3) * (width / 3),
        y: 40 + Math.floor(index / 3) * 70
      }));
      nodes.forEach((node, idx) => {
        if (idx > 0) {
          ctx.beginPath();
          ctx.moveTo(nodes[idx - 1].x, nodes[idx - 1].y);
          ctx.lineTo(node.x, node.y);
          ctx.stroke();
        }
      });
      nodes.forEach((node) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
        ctx.font = "10px Segoe UI";
        ctx.fillText(node.label, node.x + 12, node.y + 4);
        ctx.fillStyle = "rgba(96, 165, 250, 0.2)";
      });
    }
    async function loadStatus() {
      const res = await fetch("/status");
      const data = await res.json();
      const statusEl = document.getElementById("status");
      statusEl.innerHTML = \`
        <div>killSwitchEnabled: <strong>\${data.killSwitchEnabled}</strong></div>
        <div>networkEnabled: <strong>\${data.networkEnabled}</strong></div>
        <div>telemetryEnabled: <strong>\${data.telemetryEnabled}</strong></div>
        <div>strictApprovalMode: <strong>\${data.strictApprovalMode}</strong></div>
        <div>freezeEnabled: <strong>\${data.freezeEnabled}</strong></div>
        <div>vrEnabled: <strong>\${data.vrEnabled}</strong></div>
        <div>vrArmed: <strong>\${data.vrArmed}</strong></div>
        <div>phase: <strong>\${data.phase}</strong></div>
      \`;
      if (data.theme && data.theme.id) {
        document.body.dataset.theme = data.theme.id;
        if (data.theme.accent) {
          document.body.style.setProperty("--accent", data.theme.accent);
        }
        if (data.theme.glow) {
          document.body.style.setProperty("--glow", data.theme.glow);
        }
      }
      renderWorldMap(data.worldRooms);
      renderAvatars(data.avatars);
      drawScene(data.worldRooms);
      const chatStatus = document.getElementById("chatStatus");
      const networkLabel = data.networkEnabled ? "Online" : "Offline";
      const networkClass = data.networkEnabled ? "" : "offline";
      chatStatus.innerHTML = \`
        <span><span class="status-dot \${networkClass}"></span>\${networkLabel} (Local)</span>
        <span>Kill Switch: <strong>\${data.killSwitchEnabled ? "ON" : "OFF"}</strong></span>
        <span>Network: <strong>\${data.networkEnabled ? "ON" : "OFF"}</strong></span>
        <span>VR: <strong>\${data.vrArmed ? "ARMED" : "DISARMED"}</strong></span>
      \`;
      const banner = document.getElementById("safeBanner");
      if (data.killSwitchEnabled) {
        banner.textContent = "SAFE MODE — Kill Switch Enabled";
        banner.classList.add("safe");
      } else {
        banner.textContent = "Kill Switch OFF (blocked)";
        banner.classList.remove("safe");
      }
      const badges = document.getElementById("statusBadges");
      badges.innerHTML = "";
      if (data.killSwitchEnabled) {
        badges.appendChild(renderBadge("SAFE MODE", "safe"));
      }
      if (data.freezeEnabled) {
        badges.appendChild(renderBadge("FREEZE ACTIVE", "locked"));
      }
      if (data.phase7b) {
        badges.appendChild(renderBadge("PHASE 7B: " + data.phase7b, "locked"));
      }
      if (data.phase7c) {
        badges.appendChild(renderBadge("PHASE 7C: " + data.phase7c, "disabled"));
      }
      if (Array.isArray(data.layers)) {
        const summary = data.layers.map((layer) => layer.id + ":" + layer.state).join(" ");
        badges.appendChild(renderBadge("Layers " + summary, "safe"));
      }
    }
    async function loadSkills() {
      const res = await fetch("/skills");
      const data = await res.json();
      const rows = data.skills.map((skill) => {
        const stateClass =
          skill.state === "LOCKED"
            ? "state-locked"
            : skill.state === "DISABLED"
              ? "state-disabled"
              : "state-enabled";
        const riskClass =
          skill.riskLevel === "HIGH"
            ? "risk-high"
            : skill.riskLevel === "MEDIUM"
              ? "risk-medium"
              : "risk-low";
        const title = [skill.description, skill.lockReason].filter(Boolean).join(" — ");
        const enabledLabel = skill.enabled ? "ENABLED" : "DISABLED";
        return \`
          <tr title="\${title}">
            <td>\${skill.name}</td>
            <td class="\${riskClass}">\${skill.riskLevel}</td>
            <td>\${skill.requiresApproval}</td>
            <td>\${skill.networkRequired}</td>
            <td>\${enabledLabel}</td>
            <td><span class="state-pill \${stateClass}">\${skill.state}</span></td>
          </tr>
        \`;
      }).join("");
      document.getElementById("skills").innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Risk</th>
              <th>Approval</th>
              <th>Network</th>
              <th>Enabled</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>\${rows}</tbody>
        </table>
      \`;
    }
    async function loadVrStatus() {
      const res = await fetch("/vr/status");
      const data = await res.json();
      const vrEl = document.getElementById("vrStatus");
      vrEl.innerHTML = \`
        <div>enabled: <strong>\${data.enabled}</strong></div>
        <div>armed: <strong>\${data.armed}</strong></div>
        <div>armedBy: <strong>\${data.armedBy || "n/a"}</strong></div>
        <div>lastChanged: <strong>\${data.armedAt || "n/a"}</strong></div>
      \`;
    }
    async function sendChatMessage() {
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      if (!text) {
        return;
      }
      appendChatMessage(text, "user");
      input.value = "";
      const sessionId = getChatSessionId();
      const res = await fetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionId
        },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      if (data.sessionId) {
        setChatSessionId(data.sessionId);
      }
      if (data.message) {
        appendChatMessage(data.message, "assistant");
      }
      if (data.evidenceSummary) {
        appendChatMessage(data.evidenceSummary, "assistant");
      }
    }
    async function sendVrAction(path) {
      const mode = document.getElementById("modeSelect").value;
      const authority = document.getElementById("authoritySelect").value;
      const approve = document.getElementById("approveCheck").checked;
      const overrideKillSwitch = document.getElementById("vrOverrideCheck").checked;
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode,
          authority,
          approve,
          overrideKillSwitch
        })
      });
      const data = await res.json();
      const feed = document.getElementById("auditFeed");
      const entry = document.createElement("div");
      entry.className = "feed-item";
      entry.textContent =
        new Date().toISOString() +
        " • " + (data.denied ? "DENIED" : "OK") +
        " • " + (data.reason || "VR updated");
      feed.prepend(entry);
      await loadVrStatus();
      await loadStatus();
    }
    async function sendCommand(lineOverride) {
      const line = typeof lineOverride === "string"
        ? lineOverride
        : document.getElementById("commandInput").value.trim();
      const mode = document.getElementById("modeSelect").value;
      const authority = document.getElementById("authoritySelect").value;
      const approve = document.getElementById("approveCheck").checked;
      const dryRun = document.getElementById("dryRunCheck").checked;
      const evidenceMode = document.getElementById("evidenceCheck").checked;
      const shadowRun = document.getElementById("shadowCheck").checked;
      const res = await fetch("/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          line,
          mode,
          authority,
          approve,
          dryRun,
          evidenceMode,
          shadowRun
        })
      });
      const data = await res.json();
      document.getElementById("packetPanel").textContent = JSON.stringify(data.packet ?? {}, null, 2);
      document.getElementById("decisionPanel").textContent = JSON.stringify(data.decision ?? {}, null, 2);
      document.getElementById("evidencePanel").textContent = JSON.stringify(data.evidence ?? {}, null, 2);
      document.getElementById("responsePanel").textContent = JSON.stringify(data, null, 2);
      const feed = document.getElementById("auditFeed");
      const entry = document.createElement("div");
      entry.className = "feed-item";
      entry.textContent =
        new Date().toISOString() +
        " • " + (data.denied ? "DENIED" : "OK") +
        " • " + (data.reason || "Allowed") +
        (data.redacted ? " • redacted" : "");
      feed.prepend(entry);
      if (data.freezeUpdated) {
        await loadStatus();
      }
      if (data.vrUpdated) {
        await loadVrStatus();
      }
    }
    document.getElementById("sendBtn").addEventListener("click", sendCommand);
    document.getElementById("chatSendBtn").addEventListener("click", sendChatMessage);
    document.getElementById("chatInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    });
    const dryRunToggle = document.getElementById("dryRunCheck");
    const sendBtn = document.getElementById("sendBtn");
    function updateSendLabel() {
      sendBtn.textContent = dryRunToggle.checked
        ? "Send (Dry-Run)"
        : "Send (Execute Local)";
    }
    dryRunToggle.addEventListener("change", updateSendLabel);
    updateSendLabel();
    document.getElementById("freezeBtn").addEventListener("click", () => {
      sendCommand('SAFA: RUN freeze_system {"reason":"dashboard"}');
    });
    document.getElementById("unfreezeBtn").addEventListener("click", () => {
      sendCommand('SAFA: RUN unfreeze_system {"reason":"dashboard"} --approve');
    });
    document.getElementById("vrArmBtn").addEventListener("click", () => {
      sendVrAction("/vr/arm");
    });
    document.getElementById("vrDisarmBtn").addEventListener("click", () => {
      sendVrAction("/vr/disarm");
    });
    const zoneButtons = Array.from(document.querySelectorAll(".nav-item"));
    const zones = Array.from(document.querySelectorAll(".zone"));
    function setZone(zoneId) {
      zones.forEach((zone) => {
        zone.classList.toggle("hidden", zone.dataset.zone !== zoneId);
      });
      zoneButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.zone === zoneId);
      });
    }
    zoneButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.zone || "home";
        setZone(target);
      });
    });
    const toggleBtn = document.getElementById("toggleOperator");
    const chatView = document.getElementById("chatView");
    const operatorView = document.getElementById("operatorView");
    toggleBtn.addEventListener("click", () => {
      const showingOperator = !operatorView.classList.contains("hidden");
      operatorView.classList.toggle("hidden", showingOperator);
      chatView.classList.toggle("hidden", !showingOperator);
      toggleBtn.textContent = showingOperator ? "Operator Console" : "Back to Chat";
    });
    const reduceMotionToggle = document.getElementById("reduceMotionToggle");
    const highContrastToggle = document.getElementById("highContrastToggle");
    const largeTextToggle = document.getElementById("largeTextToggle");
    const motionKey = "safa_reduce_motion";
    const contrastKey = "safa_high_contrast";
    const textKey = "safa_large_text";
    function applyAccessibility() {
      const reduceMotion = localStorage.getItem(motionKey) === "true";
      const highContrast = localStorage.getItem(contrastKey) === "true";
      const largeText = localStorage.getItem(textKey) === "true";
      document.body.classList.toggle("reduce-motion", reduceMotion);
      document.body.classList.toggle("high-contrast", highContrast);
      document.body.classList.toggle("large-text", largeText);
      reduceMotionToggle.checked = reduceMotion;
      highContrastToggle.checked = highContrast;
      largeTextToggle.checked = largeText;
    }
    [reduceMotionToggle, highContrastToggle, largeTextToggle].forEach((toggle) => {
      toggle.addEventListener("change", () => {
        localStorage.setItem(motionKey, String(reduceMotionToggle.checked));
        localStorage.setItem(contrastKey, String(highContrastToggle.checked));
        localStorage.setItem(textKey, String(largeTextToggle.checked));
        applyAccessibility();
      });
    });
    document.getElementById("commandInput").addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === "Enter") {
        sendCommand();
      }
    });
    loadStatus();
    loadSkills();
    loadVrStatus();
    applyAccessibility();
    setZone("home");
    appendChatMessage(greeting(), "assistant");
  </script>
</body>
</html>`;
}

function sanitizedStatus(
  config: ResolvedConfig,
  freezeState?: FreezeState
): Record<string, unknown> {
  const freeze = freezeState ?? readFreezeState(config.rootDir);
  const vr = readVrState(config.rootDir);
  const theme = resolveTheme(config, freeze, vr);
  return {
    networkEnabled: config.network.enabled,
    killSwitchEnabled: config.killSwitch.enabled,
    strictApprovalMode: config.governance.strictApprovalMode,
    telemetryEnabled: config.telemetry.enabled,
    phase: "7A",
    phase7b: "LOCKED",
    phase7c: "PLANNED",
    safeMode: config.killSwitch.enabled,
    freezeEnabled: freeze.enabled,
    freezeReason: freeze.reason ?? null,
    evidenceMode: true,
    shadowRun: true,
    vrEnabled: vr.enabled,
    vrArmed: vr.armed,
    vrArmedBy: vr.armedBy ?? null,
    theme,
    layers: getLayerDefinitions(),
    worldRooms: getWorldRooms(),
    avatars: getAgentAvatars()
  };
}

function ensureApproved(
  queue: ApprovalQueueStore,
  key: string,
  approvalId?: string
): ApprovalQueueRecord | undefined {
  if (approvalId) {
    const record = queue.get(approvalId);
    return record && record.status === "APPROVED" ? record : undefined;
  }
  return queue.findApprovedByKey(key);
}

function tailAudit(config: ResolvedConfig, limit: number): unknown[] {
  if (!fs.existsSync(config.audit.logPath)) {
    return [];
  }
  const raw = fs.readFileSync(config.audit.logPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .filter((line: string) => line.trim().length > 0);
  const slice = lines.slice(Math.max(0, lines.length - limit));
  return slice.map((line: string) => {
    try {
      const parsed = JSON.parse(line);
      return redactSensitive(parsed) as Record<string, unknown>;
    } catch {
      return { raw: line };
    }
  });
}

export function createDashboardServer(
  configOrOptions?: ResolvedConfig | DashboardServerOptions,
  extraOptions?: DashboardServerOptions
): Server {
  const registry = buildRegistry();
  const governor = new Governor();
  const isConfig =
    configOrOptions &&
    typeof configOrOptions === "object" &&
    "network" in configOrOptions &&
    "governance" in configOrOptions;
  const options = (isConfig ? extraOptions : configOrOptions) ?? {};
  const overrides: RuntimeOverrides = options?.overrides ?? {};
  const actorDefault = options?.actorDefault ?? "dashboard";
  const ownerToken = options?.ownerToken;
  const version = loadVersion();
  const baseConfig = isConfig ? (configOrOptions as ResolvedConfig) : undefined;
  const planStore = new Map<
    string,
    {
      plan: ReturnType<Planner["createPlan"]>;
      review: ReturnType<Manager["reviewPlan"]>;
      commandText: string;
    }
  >();

  return http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    const pathName = url.pathname;
    if (!isLocalAddress(req.socket.remoteAddress)) {
      return sendJson(res, 401, { ok: false, denied: true, reason: "Unauthorized." });
    }

    const config = baseConfig
      ? applyRuntimeOverrides(baseConfig, overrides)
      : buildRuntimeConfig(options?.configPath, overrides);
    const routerDefaults = resolveRouterDefaults();
    const audit = new AuditLogger({
      logPath: config.audit.logPath,
      redactKeys: config.audit.redactKeys
    });
    const approvalStore = new ApprovalQueueStore(config.rootDir);
    const executionStore = new ExecutionStore(config.rootDir);
    const cookies = parseCookies(resolveHeaderValue(req.headers.cookie));
    const sessionCookie = cookies[SESSION_COOKIE];
    const hasSession = ownerToken ? isSessionValid(sessionCookie, ownerToken) : false;

    if (req.method === "GET" && pathName === "/") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      res.end(hasSession ? renderDashboardUi() : renderPinLockUi());
      return;
    }

    if (req.method === "POST" && pathName === "/auth/unlock") {
      if (!ownerToken) {
        return sendJson(res, 500, { ok: false, denied: true, reason: "SAFA_OWNER_TOKEN missing." });
      }
      try {
        const body = parseJsonBody(await readRequestBody(req));
        const providedPin = typeof body.pin === "string" ? body.pin.trim() : "";
        if (!providedPin || providedPin !== resolvePin()) {
          audit.log({
            timestamp: new Date().toISOString(),
            actor: actorDefault,
            action: "dashboard.unlock",
            approved: false,
            target: "auth",
            result: "DENIED: Invalid PIN."
          });
          return sendJson(res, 401, { ok: false, denied: true, reason: "Unauthorized." });
        }
        const sessionValue = createSessionCookie(ownerToken);
        res.setHeader(
          "Set-Cookie",
          `${SESSION_COOKIE}=${sessionValue}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
        );
        return sendJson(res, 200, { ok: true, status: "UNLOCKED" });
      } catch (error) {
        return sendJson(res, 400, { ok: false, denied: true, reason: String(error) });
      }
    }

    if (!isNetworkLiveDisabled()) {
      return sendJson(res, 401, { ok: false, denied: true, reason: "SAFA_NETWORK_LIVE must be 0." });
    }

    if (!hasSession) {
      return sendJson(res, 401, { ok: false, denied: true, reason: "Unauthorized." });
    }

    if (req.method === "GET" && serveStatic(res, pathName)) {
      return;
    }

    if (req.method === "GET" && pathName === "/api/state") {
      return sendJson(res, 200, {
        networkEnabled: config.network.enabled,
        killSwitchEnabled: config.killSwitch.enabled,
        strictApprovalMode: config.governance.strictApprovalMode,
        actorDefault,
        version
      });
    }

    if (req.method === "GET" && pathName === "/api/models") {
      const models = listAllModels().map((model) => ({
        provider: model.provider,
        id: model.id,
        label: model.label,
        cost: model.cost,
        reasoning: model.reasoning,
        maxContextTokens: model.maxContextTokens
      }));
      return sendJson(res, 200, { models });
    }

    if (req.method === "GET" && pathName === "/api/skills") {
      const skills = registry.list().map((skill) => ({
        name: skill.name,
        risk: skill.riskLevel,
        requiresApproval: skill.requiresApproval,
        category: skill.category
      }));
      return sendJson(res, 200, { skills });
    }

    if (req.method === "GET" && pathName === "/api/audit/tail") {
      const limit = Number(url.searchParams.get("limit") ?? "25");
      const events = tailAudit(config, Number.isNaN(limit) ? 25 : limit);
      return sendJson(res, 200, { events });
    }

    if (req.method === "GET" && pathName === "/api/executions") {
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const entries = executionStore.list(Number.isNaN(limit) ? 20 : limit);
      return sendJson(res, 200, { executions: entries });
    }

    if (req.method === "GET" && pathName === "/api/approvals") {
      const pending = approvalStore.listPending().map((record) => ({
        id: record.request.id,
        action: record.request.action,
        target: record.request.target,
        status: record.status,
        createdAt: record.request.createdAt,
        summary: record.summary
      }));
      return sendJson(res, 200, { approvals: pending });
    }

    if (req.method === "POST" && pathName === "/api/approve") {
      try {
        const body = parseJsonBody(await readRequestBody(req));
        const approvalId = body.approvalId;
        const decision = body.decision;
        const actor = resolveActor(body, actorDefault);
        if (typeof approvalId !== "string" || approvalId.length === 0) {
          return sendJson(res, 400, { error: "approvalId is required" });
        }
        if (decision !== "APPROVE" && decision !== "DENY") {
          return sendJson(res, 400, { error: "decision must be APPROVE or DENY" });
        }
        const record = approvalStore.get(approvalId);
        if (!record) {
          return sendJson(res, 404, { error: "Approval not found" });
        }
        if (decision === "APPROVE") {
          record.request = approveRequest(record.request, { actor, audit });
          record.status = record.request.status;
        } else {
          record.request = denyRequest(record.request, { actor, audit }, "Denied by owner.");
          record.status = record.request.status;
        }
        approvalStore.upsert(record);
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "dashboard.approval",
          approved: decision === "APPROVE",
          target: record.request.id,
          result: JSON.stringify(
            redactSensitive({
              decision,
              action: record.request.action,
              target: record.request.target
            })
          )
        });
        return sendJson(res, 200, {
          id: record.request.id,
          status: record.status
        });
      } catch (error) {
        return sendJson(res, 400, { error: String(error) });
      }
    }

    if (req.method === "POST" && pathName === "/api/plan") {
      try {
        const body = parseJsonBody(await readRequestBody(req));
        const commandText = body.commandText;
        const actor = resolveActor(body, actorDefault);
        if (typeof commandText !== "string" || !commandText.trim()) {
          return sendJson(res, 400, { error: "commandText is required" });
        }
        const planner = new Planner();
        const plan = planner.createPlan(commandText, {
          actor,
          audit,
          authority: AuthorityLevel.OWNER,
          commandMode: "CLARIFY",
          freshOwnerInput: true
        });
        const manager = new Manager(registry);
        const review = manager.reviewPlan(plan, config, false);
        const routerInput = normalizeRouterInput(
          body,
          routerDefaults,
          commandText,
          undefined,
          review.approvalRequired
        );
        const policy = routeModel(routerInput);
        const planHash = hashPayload(plan);
        planStore.set(planHash, { plan, review, commandText });
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "dashboard.plan",
          approved: false,
          target: "plan",
          result: JSON.stringify(
            redactSensitive({ planHash, commandText })
          )
        });
        return sendJson(res, 200, {
          plan,
          planHash,
          valid: review.valid,
          requiresApproval: review.approvalRequired,
          model_used: `${policy.model.provider}:${policy.model.id}`,
          policy_reason: policy.reason.join(" | "),
          policy_trace: {
            mode: policy.mode,
            model: policy.model,
            budget: routerInput.budget,
            risk: routerInput.risk,
            reasons: policy.reason
          }
        });
      } catch (error) {
        return sendJson(res, 400, { error: String(error) });
      }
    }

    if (req.method === "POST" && pathName === "/api/exec") {
      try {
        const body = parseJsonBody(await readRequestBody(req));
        const planHash = body.planHash;
        const approve = body.approve === true;
        const approvalId = typeof body.approvalId === "string" ? body.approvalId : undefined;
        const actor = resolveActor(body, actorDefault);
        if (typeof planHash !== "string" || !planHash.trim()) {
          return sendJson(res, 400, { error: "planHash is required" });
        }
        const stored = planStore.get(planHash);
        if (!stored) {
          return sendJson(res, 404, { error: "Unknown planHash" });
        }
        const routerInput = normalizeRouterInput(
          body,
          routerDefaults,
          stored.commandText,
          undefined,
          stored.review.approvalRequired
        );
        const policy = routeModel(routerInput);
        const approvalKey = `exec:${planHash}`;
        if (stored.review.approvalRequired) {
          if (!approve) {
            const record = createPendingApproval(
              approvalStore,
              audit,
              actor,
              approvalKey,
              "exec",
              planHash,
              { planHash }
            );
            return sendJson(res, 202, {
              status: "PENDING_APPROVAL",
              approvalId: record.request.id,
              summary: record.summary,
              model_used: `${policy.model.provider}:${policy.model.id}`,
              policy_reason: policy.reason.join(" | "),
              policy_trace: {
                mode: policy.mode,
                model: policy.model,
                budget: routerInput.budget,
                risk: routerInput.risk,
                reasons: policy.reason
              }
            });
          }
          const approvedRecord = ensureApproved(approvalStore, approvalKey, approvalId);
          if (!approvedRecord) {
            return sendJson(res, 403, { error: "Approval not recorded." });
          }
        }

        const operator = new Operator(registry, audit, governor);
        const execution = await operator.executePlan(stored.review, {
          actor,
          approved: stored.review.approvalRequired,
          config,
          authority: AuthorityLevel.OWNER,
          commandMode: "SCRIPT"
        });
        executionStore.append({
          id: `exec-${Date.now()}`,
          kind: "plan",
          actor,
          success: execution.success,
          createdAt: new Date().toISOString(),
          planHash,
          steps: execution.results.map((result) => ({
            stepId: result.stepId,
            skill: result.skill,
            success: result.success
          }))
        });
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "dashboard.exec",
          approved: approve,
          target: planHash,
          result: JSON.stringify({ success: execution.success })
        });
        return sendJson(res, execution.success ? 200 : 500, {
          status: execution.success ? "OK" : "FAILED",
          results: execution.results,
          model_used: `${policy.model.provider}:${policy.model.id}`,
          policy_reason: policy.reason.join(" | "),
          policy_trace: {
            mode: policy.mode,
            model: policy.model,
            budget: routerInput.budget,
            risk: routerInput.risk,
            reasons: policy.reason
          }
        });
      } catch (error) {
        return sendJson(res, 400, { error: String(error) });
      }
    }

    if (req.method === "POST" && pathName === "/api/run") {
      try {
        const body = parseJsonBody(await readRequestBody(req));
        const skillName = body.skill;
        const approve = body.approve === true;
        const approvalId = typeof body.approvalId === "string" ? body.approvalId : undefined;
        const actor = resolveActor(body, actorDefault);
        const input = typeof body.input === "object" && body.input ? (body.input as Record<string, unknown>) : {};
        if (typeof skillName !== "string" || !skillName.trim()) {
          return sendJson(res, 400, { error: "skill is required" });
        }
        const skill = registry.get(skillName);
        if (!skill) {
          return sendJson(res, 404, { error: "Unknown skill" });
        }
        const approvalRequired = config.governance.strictApprovalMode || skill.requiresApproval;
        const approvalPayload = { input, skill: skillName };
        const payloadHash = hashPayload(approvalPayload);
        const approvalKey = `run:${skillName}:${payloadHash}`;
        const freezeState = readFreezeState(config.rootDir);
        let approvedRecord: ApprovalQueueRecord | undefined;
        if (approvalRequired) {
          if (!approve) {
            const record = createPendingApproval(
              approvalStore,
              audit,
              actor,
              approvalKey,
              "run",
              skillName,
              approvalPayload
            );
            return sendJson(res, 202, {
              status: "PENDING_APPROVAL",
              approvalId: record.request.id,
              summary: record.summary
            });
          }
          approvedRecord = ensureApproved(approvalStore, approvalKey, approvalId);
          if (!approvedRecord) {
            return sendJson(res, 403, { error: "Approval not recorded." });
          }
        }

        const allowWhenNetworkOff = buildAllowWhenNetworkOff(skill, input);
        const decision = governor.evaluate(
          {
            type: skill.name,
            category: skill.category,
            riskLevel: skill.riskLevel,
            requiresApproval: skill.requiresApproval,
            allowWhenNetworkOff
          },
          config,
          {
            actor,
            approved: approvalRequired,
            authority: AuthorityLevel.OWNER,
            commandMode: "SCRIPT",
            audit,
            freezeEnabled: freezeState.enabled,
            defenseText: JSON.stringify(input ?? {}),
            maturityLevel: 5,
            freshOwnerInput: true,
            costEstimateUsd: 0,
            approval: approvedRecord?.request,
            payloadHash
          },
          buildNetworkRequest(skill, input)
        );
        if (!decision.allowed) {
          audit.log({
            timestamp: new Date().toISOString(),
            actor,
            action: "dashboard.run",
            approved: approvalRequired,
            target: skillName,
            result: JSON.stringify(
              redactSensitive({ denied: true, reason: decision.reason, input })
            )
          });
          return sendJson(res, 403, { error: decision.reason });
        }

        const result = await registry.execute(skillName, input, {
          actor,
          approved: approvalRequired,
          authority: AuthorityLevel.OWNER,
          commandMode: "SCRIPT",
          config,
          audit,
          governor,
          approval: approvedRecord?.request,
          payloadHash,
          freezeEnabled: freezeState.enabled
        });
        executionStore.append({
          id: `run-${Date.now()}`,
          kind: "skill",
          actor,
          success: result.success,
          createdAt: new Date().toISOString(),
          skill: skillName,
          error: result.success ? undefined : result.error
        });
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "dashboard.run",
          approved: approvalRequired,
          target: skillName,
          result: JSON.stringify(
            redactSensitive({ success: result.success, input })
          )
        });
        return sendJson(res, result.success ? 200 : 500, {
          status: result.success ? "OK" : "FAILED",
          output: result.output ?? null,
          error: result.error ?? null
        });
      } catch (error) {
        return sendJson(res, 400, { error: String(error) });
      }
    }

    if (req.method === "GET" && pathName === "/status") {
      const freezeState = readFreezeState(config.rootDir);
      return sendJson(res, 200, sanitizedStatus(config, freezeState));
    }
    if (req.method === "GET" && pathName === "/skills") {
      const skills = registry.list().map((skill) => {
        const availability = resolveSkillAvailability(skill, config);
        return {
          name: skill.name,
          description: skill.description,
          riskLevel: skill.riskLevel,
          requiresApproval: skill.requiresApproval,
          allowWhenNetworkOff: skill.allowWhenNetworkOff,
          networkRequired: skill.category === "network",
          enabled: availability.enabled,
          state: availability.state,
          lockReason: availability.lockReason,
          layer: resolveSkillLayer(skill)
        };
      });
      return sendJson(res, 200, { skills });
    }
    if (req.method === "POST" && pathName === "/chat") {
      const actor = actorDefault;
      readRequestBody(req)
        .then(async (body) => {
          let payload: { message?: string };
          try {
            payload = JSON.parse(body);
          } catch {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.chat",
              approved: false,
              target: "chat",
              result: "ERROR: Invalid JSON payload."
            });
            return sendJson(res, 400, { ok: false, denied: true, reason: "Invalid JSON payload." });
          }

          const text = normalizeChatText(payload.message ?? "");
          if (!text) {
            return sendJson(res, 400, { ok: false, denied: true, reason: "Message is required." });
          }

          const sessionHeader = resolveHeaderValue(req.headers["x-session-id"]);
          const session = resolveSessionId(sessionHeader);
          const sessionState = readChatSession(config.rootDir, session.id);
          const intent = classifyChatIntent(text, sessionState.pending);
          const freezeState = readFreezeState(config.rootDir);
          const inputHash = hashChatText(text);

          audit.log({
            timestamp: new Date().toISOString(),
            actor,
            action: "dashboard.chat",
            approved: false,
            target: "chat",
            result: JSON.stringify({ inputHash, sessionId: session.id })
          });

          if (!process.env.OPENAI_API_KEY) {
            return sendJson(res, 500, { ok: false, error: "OPENAI_API_KEY missing" });
          }

          if (intent.type === "status") {
            const status = sanitizedStatus(config, freezeState);
            return sendJson(res, 200, {
              ok: true,
              message: "Here is the current system status.",
              data: status,
              evidenceSummary: buildChatEvidence({
                action: "Status requested",
                decision: "Allowed",
                touched: [],
                recommendation: "Continue with a task or ask for a plan."
              }),
              sessionId: session.id
            });
          }

          if (intent.type === "skills") {
            return sendJson(res, 200, {
              ok: true,
              message: "Here are the available skills.",
              data: {
                skills: registry.list().map((skill) => ({
                  name: skill.name,
                  riskLevel: skill.riskLevel,
                  requiresApproval: skill.requiresApproval,
                  state: resolveSkillAvailability(skill, config).state
                }))
              },
              evidenceSummary: buildChatEvidence({
                action: "Skills requested",
                decision: "Allowed",
                touched: [],
                recommendation: "Tell me what you want to do in plain language."
              }),
              sessionId: session.id
            });
          }

          if (intent.type === "plan") {
            const planner = new Planner();
            const plan = planner.createPlan(intent.task, {
              actor,
              audit,
              authority: AuthorityLevel.OWNER,
              commandMode: "SCRIPT",
              freshOwnerInput: true
            });
            const planSummary = plan.steps
              .map((step, index) => `${index + 1}. ${step.description}`)
              .join("\n");
            return sendJson(res, 200, {
              ok: true,
              message: `Here is a draft plan for "${plan.task}":\n${planSummary}`,
              evidenceSummary: buildChatEvidence({
                action: "Plan created",
                decision: "Allowed",
                touched: [],
                recommendation: "Say yes to proceed or ask for changes."
              }),
              sessionId: session.id
            });
          }

          if (intent.type === "cancel_pending") {
            clearChatSession(config.rootDir, session.id);
            return sendJson(res, 200, {
              ok: true,
              message: "Understood. I canceled the pending action.",
              evidenceSummary: buildChatEvidence({
                action: "Pending action canceled",
                decision: "Canceled by user",
                touched: [],
                recommendation: "Describe a new task when ready."
              }),
              sessionId: session.id
            });
          }

          if (intent.type === "approve_pending") {
            if (!sessionState.pending) {
              return sendJson(res, 200, {
                ok: true,
                message: "There is nothing pending approval.",
                sessionId: session.id
              });
            }
            const pending = sessionState.pending;
            clearChatSession(config.rootDir, session.id);
            const execution = await registry.execute(pending.skill, pending.input, {
              actor,
              approved: true,
              authority: AuthorityLevel.OWNER,
              commandMode: "SCRIPT",
              config,
              audit,
              governor,
              freezeEnabled: freezeState.enabled
            });
            if (!execution.success) {
              return sendJson(res, 403, {
                ok: false,
                denied: true,
                message: execution.error ?? "Action denied.",
                evidenceSummary: buildChatEvidence({
                  action: pending.description,
                  decision: execution.error ?? "Denied",
                  touched: summarizeTouchedTargets(pending.skill, pending.input),
                  recommendation: "Adjust the request or ask for a safer alternative."
                }),
                sessionId: session.id
              });
            }
            const redaction = redactOutput(
              execution.output ?? null,
              config.audit.redactKeys
            );
            return sendJson(res, 200, {
              ok: true,
              message: `Done. ${formatChatOutput(redaction.redacted)}`,
              evidenceSummary: buildChatEvidence({
                action: pending.description,
                decision: "Approved and executed",
                touched: summarizeTouchedTargets(pending.skill, pending.input),
                recommendation: "Ask what to do next or request a summary."
              }),
              sessionId: session.id,
              redacted: redaction.hadSecrets || redaction.hadPii
            });
          }

          if (intent.type === "execute") {
            const skillDef = registry.get(intent.skill);
            if (!skillDef) {
              try {
                const reply = await generateChatModelReply(
                  text,
                  routerDefaults,
                  audit,
                  actor,
                  session.id,
                  config.audit.redactKeys
                );
                return sendJson(res, 200, {
                  ok: true,
                  message: reply.message,
                  model_used: reply.modelUsed,
                  sessionId: session.id
                });
              } catch (error) {
                return sendJson(res, 500, { ok: false, error: String(error) });
              }
            }
            writeChatSession(config.rootDir, session.id, {
              pending: {
                skill: intent.skill,
                input: intent.input,
                createdAt: new Date().toISOString(),
                description: `Execute ${intent.skill}`
              }
            });
            return sendJson(res, 200, {
              ok: true,
              message: `I can run ${intent.skill} for you. Do you approve?`,
              evidenceSummary: buildChatEvidence({
                action: `Proposed ${intent.skill}`,
                decision: "Approval required",
                touched: summarizeTouchedTargets(intent.skill, intent.input),
                recommendation: "Reply with 'Yes' to approve or 'No' to cancel."
              }),
              sessionId: session.id
            });
          }

          if (intent.type === "model") {
            try {
              const reply = await generateChatModelReply(
                text,
                routerDefaults,
                audit,
                actor,
                session.id,
                config.audit.redactKeys
              );
              return sendJson(res, 200, {
                ok: true,
                message: reply.message,
                model_used: reply.modelUsed,
                sessionId: session.id
              });
            } catch (error) {
              return sendJson(res, 500, { ok: false, error: String(error) });
            }
          }

          return sendJson(res, 200, {
            ok: true,
            message: "Unhandled chat request.",
            sessionId: session.id
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          return sendJson(res, 413, { ok: false, denied: true, reason: message });
        });
      return;
    }
    if (req.method === "GET" && pathName === "/vr/status") {
      const vrState = readVrState(config.rootDir);
      return sendJson(res, 200, {
        enabled: vrState.enabled,
        armed: vrState.armed,
        armedBy: vrState.armedBy ?? null,
        armedAt: vrState.armedAt ?? null
      });
    }
    if (
      req.method === "POST" &&
      (pathName === "/vr/arm" || pathName === "/vr/disarm")
    ) {
      const actor = actorDefault;
      readRequestBody(req)
        .then((body) => {
          let payload: {
            mode?: string;
            authority?: string;
            approve?: boolean;
            overrideKillSwitch?: boolean;
          };
          try {
            payload = JSON.parse(body);
          } catch {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "vr.command",
              approved: false,
              target: pathName,
              result: "ERROR: Invalid JSON payload."
            });
            return sendJson(res, 400, { ok: false, denied: true, reason: "Invalid JSON payload." });
          }

          const commandMode = parseCommandMode(payload.mode);
          const authority = resolveAuthority(payload.authority);
          const approvedFlag = payload.approve === true;
          const overrideKillSwitch = payload.overrideKillSwitch === true;
          const freezeState = readFreezeState(config.rootDir);

          if (!commandMode) {
            return sendJson(res, 400, {
              ok: false,
              denied: true,
              reason: "Command mode is required."
            });
          }
          if (authority !== AuthorityLevel.OWNER) {
            return sendJson(res, 403, {
              ok: false,
              denied: true,
              reason: "Owner authority is required."
            });
          }
          if (!approvedFlag) {
            return sendJson(res, 403, {
              ok: false,
              denied: true,
              reason: "Approval is required."
            });
          }
          if (pathName === "/vr/arm" && config.killSwitch.enabled && !overrideKillSwitch) {
            return sendJson(res, 403, {
              ok: false,
              denied: true,
              reason: "Kill switch override required to arm VR."
            });
          }

          let decision;
          try {
            decision = governor.evaluate(
              {
                type: pathName === "/vr/arm" ? "vr.arm" : "vr.disarm",
                category: "external_tool",
                riskLevel: pathName === "/vr/arm" ? "HIGH" : "MEDIUM",
                requiresApproval: true,
                allowWhenNetworkOff: true,
                allowWhenKillSwitch: pathName === "/vr/arm" ? overrideKillSwitch : true,
                allowWhenFrozen: pathName === "/vr/disarm"
              },
              config,
              {
                actor,
                approved: approvedFlag,
                authority,
                commandMode,
                audit,
                freezeEnabled: freezeState.enabled,
                defenseText: pathName,
                maturityLevel: 5,
                freshOwnerInput: true,
                costEstimateUsd: 0
              }
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return sendJson(res, 400, { ok: false, denied: true, reason: message });
          }

          if (!decision.allowed) {
            return sendJson(res, 403, {
              ok: false,
              denied: true,
              reason: decision.reason
            });
          }

          try {
            const state =
              pathName === "/vr/arm"
                ? armVr(config.rootDir, actor)
                : disarmVr(config.rootDir, actor);
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: pathName === "/vr/arm" ? "vr.arm" : "vr.disarm",
              approved: approvedFlag,
              target: "vr",
              result: JSON.stringify({ armed: state.armed })
            });
            return sendJson(res, 200, {
              ok: true,
              denied: false,
              state,
              vrUpdated: true
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: pathName === "/vr/arm" ? "vr.arm" : "vr.disarm",
              approved: approvedFlag,
              target: "vr",
              result: `ERROR: ${message}`
            });
            return sendJson(res, 403, { ok: false, denied: true, reason: message });
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          return sendJson(res, 413, { ok: false, denied: true, reason: message });
        });
      return;
    }
    if (req.method === "POST" && pathName === "/command") {
      let actor = actorDefault;
      readRequestBody(req)
        .then(async (body) => {
          let payload: {
            line?: string;
            text?: string;
            mode?: string;
            authority?: string;
            approve?: boolean;
            dryRun?: boolean;
            shadowRun?: boolean;
            evidenceMode?: boolean;
          };
          try {
            payload = JSON.parse(body);
          } catch {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: false,
              target: "command",
              result: "ERROR: Invalid JSON payload."
            });
            return sendJson(res, 400, { ok: false, denied: true, reason: "Invalid JSON payload." });
          }

          actor = resolveActor(payload as Record<string, unknown>, actorDefault);

          const line = (payload.line ?? payload.text ?? "").trim();
          const dryRun = payload.dryRun !== false;
          const shadowRun = payload.shadowRun !== false;
          const evidenceMode = payload.evidenceMode !== false;
          const auditId = `dash-${Date.now()}`;
          const freezeState = readFreezeState(config.rootDir);

          if (!line) {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: false,
              target: "command",
              result: "ERROR: Missing command."
            });
            return sendJson(res, 400, { ok: false, denied: true, reason: "Missing command." });
          }
          let summary;
          try {
            summary = summarizeSAFALine(line);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: false,
              target: "command",
              result: `ERROR: ${message}`
            });
            return sendJson(res, 400, { ok: false, denied: true, reason: message, auditId });
          }

          const argv = [...summary.argv];
          ensureFlag(argv, "--mode", payload.mode);
          ensureFlag(argv, "--authority", payload.authority);
          ensureBooleanFlag(argv, "--approve", payload.approve === true);

          const commandMode = parseCommandMode(getFlagValue(argv, "--mode"));
          const authority = resolveAuthority(getFlagValue(argv, "--authority"));
          const approvedFlag = argv.includes("--approve");

          if (!commandMode) {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: approvedFlag,
              target: summary.command,
              result: JSON.stringify({ inputHash: summary.inputHash, error: "Missing mode." })
            });
            return sendJson(res, 400, {
              ok: false,
              denied: true,
              reason: "Command mode is required.",
              auditId
            });
          }
          if (authority !== AuthorityLevel.OWNER) {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: approvedFlag,
              target: summary.command,
              result: JSON.stringify({ inputHash: summary.inputHash, error: "Owner authority required." })
            });
            return sendJson(res, 403, {
              ok: false,
              denied: true,
              reason: "Owner authority is required.",
              auditId
            });
          }

          if (summary.command !== "run" && summary.command !== "status" && summary.command !== "skills") {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: approvedFlag,
              target: summary.command,
              result: JSON.stringify({ inputHash: summary.inputHash, error: "Unsupported command." })
            });
            return sendJson(res, 400, {
              ok: false,
              denied: true,
              reason: "Dashboard supports only run/skills/status.",
              auditId
            });
          }

          const commandContext = {
            actor,
            approved: approvedFlag,
            authority,
            commandMode,
            audit,
            freezeEnabled: freezeState.enabled,
            defenseText: JSON.stringify({ line }),
            maturityLevel: 5,
            freshOwnerInput: true,
            costEstimateUsd: 0
          };

          let decision;
          let preview: Record<string, unknown> = {};
          let executionRedacted = false;
          let packet: Record<string, unknown> = {
            id: `packet-${Date.now()}`,
            command: summary.command,
            argv: sanitizeArgv(argv),
            inputHash: summary.inputHash,
            dryRun,
            shadowRun,
            evidenceMode
          };
          let executedControl = false;
          let executedLocal = false;
          let controlResult: Record<string, unknown> | undefined;

          if (summary.command === "status") {
            decision = governor.evaluate(
              {
                type: "dashboard.status",
                category: "local",
                riskLevel: "LOW",
                requiresApproval: false,
                allowWhenNetworkOff: true,
                allowWhenFrozen: true
              },
              config,
              commandContext
            );
            preview = sanitizedStatus(config, freezeState);
          } else if (summary.command === "skills") {
            decision = governor.evaluate(
              {
                type: "dashboard.skills",
                category: "local",
                riskLevel: "LOW",
                requiresApproval: false,
                allowWhenNetworkOff: true,
                allowWhenFrozen: true
              },
              config,
              commandContext
            );
            const skills = registry.list().map((skill) => {
              const availability = resolveSkillAvailability(skill, config);
              return {
                name: skill.name,
                riskLevel: skill.riskLevel,
                requiresApproval: skill.requiresApproval,
                allowWhenNetworkOff: skill.allowWhenNetworkOff,
                networkRequired: skill.category === "network",
                enabled: availability.enabled,
                state: availability.state,
                lockReason: availability.lockReason,
                layer: resolveSkillLayer(skill)
              };
            });
            preview = { skills };
          } else {
            const skillName = argv[1];
            if (!skillName) {
              return sendJson(res, 400, {
                ok: false,
                denied: true,
                reason: "Missing skill name.",
                auditId
              });
            }
            const skill = registry.get(skillName);
            if (!skill) {
              return sendJson(res, 404, {
                ok: false,
                denied: true,
                reason: "Unknown skill.",
                auditId
              });
            }
            const availability = resolveSkillAvailability(skill, config);
            const isExternal =
              skill.category === "network" ||
              skill.category === "outbound_message" ||
              skill.category === "external_tool";
            const input = extractInputFromArgs(argv);
            input.dryRun = dryRun;
            updateInputArg(argv, input);
            packet = {
              ...packet,
              argv: sanitizeArgv(argv),
              skill: skill.name,
              inputKeys: Object.keys(input)
            };
            const isControlAction = ["freeze_system", "unfreeze_system"].includes(
              skill.name
            );

            try {
              const allowWhenNetworkOff = buildAllowWhenNetworkOff(skill, input);
                decision = governor.evaluate(
                {
                  type: skill.name,
                  category: skill.category,
                  riskLevel: skill.riskLevel,
                  requiresApproval: skill.requiresApproval,
                    allowWhenNetworkOff,
                    allowWhenFrozen: isControlAction
                },
                config,
                {
                  ...commandContext,
                  defenseText:
                    skill.name === "analyze_input_risk"
                      ? ""
                      : JSON.stringify(input ?? {})
                },
                buildNetworkRequest(skill, input)
              );
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              audit.log({
                timestamp: new Date().toISOString(),
                actor,
                action: "dashboard.command",
                approved: approvedFlag,
                target: skill.name,
                result: JSON.stringify({ inputHash: summary.inputHash, error: message })
              });
              return sendJson(res, 400, {
                ok: false,
                denied: true,
                reason: message,
                auditId
              });
            }
            let executionOutput: unknown;

            if (decision && decision.allowed && isControlAction) {
              const execResult = await registry.execute(skill.name, input, {
                actor,
                approved: approvedFlag,
                authority,
                commandMode,
                config,
                audit,
                governor,
                freezeEnabled: freezeState.enabled
              });
              if (!execResult.success) {
                decision = {
                  allowed: false,
                  reason: execResult.error ?? "Control action failed."
                };
              } else {
                executedControl = true;
                controlResult =
                  execResult.output && typeof execResult.output === "object"
                    ? (execResult.output as Record<string, unknown>)
                    : { result: execResult.output };
              }
            } else if (!dryRun && isExternal) {
              decision = {
                allowed: false,
                reason: "External execution is disabled."
              };
            } else if (
              !dryRun &&
              decision &&
              decision.allowed &&
              availability.state === "ENABLED" &&
              skill.category === "local"
            ) {
              const execResult = await registry.execute(skill.name, input, {
                actor,
                approved: approvedFlag,
                authority,
                commandMode,
                config,
                audit,
                governor,
                freezeEnabled: freezeState.enabled
              });
              if (!execResult.success) {
                decision = {
                  allowed: false,
                  reason: execResult.error ?? "Execution failed."
                };
              } else {
                executedLocal = true;
                const redaction = redactOutput(
                  execResult.output ?? null,
                  config.audit.redactKeys
                );
                executionOutput = redaction.redacted;
                executionRedacted = redaction.hadSecrets || redaction.hadPii;
              }
            }

            preview = {
              skill: skill.name,
              dryRun,
              shadowRun,
              note: isControlAction
                ? "Control action executed (freeze safety override)."
                : dryRun
                  ? "Simulation only; no execution from dashboard."
                  : "Executed locally under governance.",
              controlResult,
              executionOutput,
              executionRedacted
            };
          }

          const allowed = decision.allowed === true;
          const reason = allowed ? "" : decision.reason;
          const executed = executedControl || executedLocal;
          const touched =
            summary.command === "run" && packet && "skill" in packet
              ? summarizeTouchedTargets(String(packet.skill ?? ""), extractInputFromArgs(argv))
              : [];
          const wouldHappen = dryRun
            ? "Dry-run preview only. No execution."
            : executed
              ? "Executed locally under governance."
              : "Execution blocked.";
          const evidence = {
            intent: summary.command,
            outcome: allowed ? "ALLOWED" : "DENIED",
            decision: decision.reason,
            wouldHappen,
            blocked: allowed ? "None" : decision.reason,
            touched,
            mode: { evidenceMode, shadowRun },
            suggestedNextAction: reason.includes("approval")
              ? "Provide explicit approval."
              : reason.includes("authority")
                ? "Use --authority OWNER."
                : reason.includes("mode")
                  ? "Provide --mode SCRIPT."
                  : "Review inputs and governance constraints."
          };
          const nextFreezeState = executedControl
            ? readFreezeState(config.rootDir)
            : freezeState;
          audit.log({
            timestamp: new Date().toISOString(),
            actor,
            action: "dashboard.command",
            approved: approvedFlag,
            target: summary.command,
            result: JSON.stringify({
              inputHash: summary.inputHash,
              auditId,
              decision: decision.reason
            })
          });
          return sendJson(res, allowed ? 200 : 403, {
            ok: allowed,
            denied: !allowed,
            reason,
            decision,
            preview,
            packet,
            evidence,
            auditId,
            redacted: executionRedacted,
            shadowRun,
            evidenceMode,
            freezeUpdated: executedControl,
            freezeState: executedControl ? nextFreezeState : undefined
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          return sendJson(res, 413, { ok: false, denied: true, reason: message });
        });
      return;
    }

    if (req.method === "POST" && pathName === "/api/kill") {
      try {
        const body = parseJsonBody(await readRequestBody(req));
        const enabled = body.enabled;
        const approve = body.approve === true;
        const approvalId = typeof body.approvalId === "string" ? body.approvalId : undefined;
        const actor = resolveActor(body, actorDefault);
        if (typeof enabled !== "boolean") {
          return sendJson(res, 400, { error: "enabled must be boolean" });
        }
        const approvalKey = `kill:${enabled ? "on" : "off"}`;
        if (!approve) {
          const record = createPendingApproval(
            approvalStore,
            audit,
            actor,
            approvalKey,
            "kill_switch",
            enabled ? "enable" : "disable",
            { enabled }
          );
          return sendJson(res, 202, {
            status: "PENDING_APPROVAL",
            approvalId: record.request.id,
            summary: record.summary
          });
        }
        const approvedRecord = ensureApproved(approvalStore, approvalKey, approvalId);
        if (!approvedRecord) {
          return sendJson(res, 403, { error: "Approval not recorded." });
        }
        overrides.killSwitchEnabled = enabled;
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "dashboard.kill_switch",
          approved: true,
          target: "kill_switch",
          result: JSON.stringify({ enabled })
        });
        return sendJson(res, 200, { status: "OK", enabled });
      } catch (error) {
        return sendJson(res, 400, { error: String(error) });
      }
    }

    if (req.method === "POST" && pathName === "/api/network") {
      try {
        const body = parseJsonBody(await readRequestBody(req));
        const enabled = body.enabled;
        const approve = body.approve === true;
        const approvalId = typeof body.approvalId === "string" ? body.approvalId : undefined;
        const actor = resolveActor(body, actorDefault);
        if (typeof enabled !== "boolean") {
          return sendJson(res, 400, { error: "enabled must be boolean" });
        }
        if (enabled && !config.network.enabled) {
          audit.log({
            timestamp: new Date().toISOString(),
            actor,
            action: "dashboard.network",
            approved: false,
            target: "network",
            result: "DENIED: Network is disabled by config."
          });
          return sendJson(res, 403, { error: "Network is disabled by config." });
        }
        const approvalKey = `network:${enabled ? "on" : "off"}`;
        if (!approve) {
          const record = createPendingApproval(
            approvalStore,
            audit,
            actor,
            approvalKey,
            "network",
            enabled ? "enable" : "disable",
            { enabled }
          );
          return sendJson(res, 202, {
            status: "PENDING_APPROVAL",
            approvalId: record.request.id,
            summary: record.summary
          });
        }
        const approvedRecord = ensureApproved(approvalStore, approvalKey, approvalId);
        if (!approvedRecord) {
          return sendJson(res, 403, { error: "Approval not recorded." });
        }
        overrides.networkEnabled = enabled;
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "dashboard.network",
          approved: true,
          target: "network",
          result: JSON.stringify({ enabled })
        });
        return sendJson(res, 200, { status: "OK", enabled });
      } catch (error) {
        return sendJson(res, 400, { error: String(error) });
      }
    }

    if (req.method === "GET" && pathName === "/" && serveStatic(res, "/index.html")) {
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });
}

export function startDashboardServer(
  argsOrOptions?:
    | string[]
    | {
        port?: number;
        configPath?: string;
        actorDefault?: string;
        exit?: (code: number) => void;
      },
  options?: { exit?: (code: number) => void }
): Server {
  const isArgs = Array.isArray(argsOrOptions);
  const args = isArgs ? (argsOrOptions as string[]) : [];
  const exit = isArgs ? options?.exit : argsOrOptions?.exit;
  const configPath = isArgs
    ? getFlagValue(args, "--config")
    : argsOrOptions?.configPath;
  const actorDefault = isArgs
    ? getFlagValue(args, "--actor") ?? "dashboard"
    : argsOrOptions?.actorDefault ?? "dashboard";
  const portRaw = isArgs ? getFlagValue(args, "--port") : undefined;
  const parsedPort = portRaw ? Number(portRaw) : Number.NaN;
  const port = isArgs
    ? Number.isFinite(parsedPort)
      ? parsedPort
      : DEFAULT_PORT
    : argsOrOptions?.port ?? DEFAULT_PORT;

  const config = loadConfig(configPath);
  const audit = new AuditLogger({
    logPath: config.audit.logPath,
    redactKeys: config.audit.redactKeys
  });
  const actor = actorDefault;
  const ownerToken = process.env.SAFA_OWNER_TOKEN;
  const logger = console;

  if (!ownerToken) {
    logger.error("DENIED: SAFA_OWNER_TOKEN is required to start the dashboard.");
    if (exit) {
      exit(1);
      throw new Error("__EXIT__:1");
    }
    process.exit(1);
  }

  if (!config.killSwitch.enabled) {
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "dashboard.start.denied",
      approved: false,
      target: "dashboard",
      result: "Kill switch must be enabled to start the dashboard."
    });
    logger.error("DENIED: Kill switch must be enabled to start the dashboard.");
    if (exit) {
      exit(1);
      throw new Error("__EXIT__:1");
    }
    process.exit(1);
  }

  const hostFlag = isArgs ? getFlagValue(args, "--host") : undefined;
  if (hostFlag && hostFlag !== "127.0.0.1") {
    logger.error("DENIED: Dashboard host must be 127.0.0.1.");
    if (exit) {
      exit(1);
      throw new Error("__EXIT__:1");
    }
    process.exit(1);
  }

  const server = createDashboardServer(config, {
    ownerToken,
    actorDefault
  });
  server.listen(port, HOST, () => {
    console.log(`Dashboard listening on http://${HOST}:${port}`);
  });
  return server;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const configIndex = args.indexOf("--config");
  const portIndex = args.indexOf("--port");
  const actorIndex = args.indexOf("--actor");
  const configPath = configIndex >= 0 ? args[configIndex + 1] : undefined;
  const portRaw = portIndex >= 0 ? args[portIndex + 1] : undefined;
  const actorDefault = actorIndex >= 0 ? args[actorIndex + 1] : "dashboard";
  const port = portRaw ? Number(portRaw) : DEFAULT_PORT;
  startDashboardServer({
    port: Number.isNaN(port) ? DEFAULT_PORT : port,
    configPath,
    actorDefault
  });
}
