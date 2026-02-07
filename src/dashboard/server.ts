import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
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
import {
  approveRequest,
  createApprovalRequest,
  denyRequest,
  type ApprovalRequest,
  type ApprovalStatus
} from "../core/approvals";

const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_PORT = 3777;
const HOST = "127.0.0.1";
const STATIC_ROOT = path.resolve(__dirname, "..", "..", "dashboard");

interface RuntimeOverrides {
  killSwitchEnabled?: boolean;
  networkEnabled?: boolean;
}

interface ApprovalRecord {
  request: ApprovalRequest;
  status: ApprovalStatus;
  key: string;
  summary: string;
}

class ApprovalQueue {
  private readonly approvals = new Map<string, ApprovalRecord>();
  private readonly keyIndex = new Map<string, string>();

  create(record: ApprovalRecord): ApprovalRecord {
    this.approvals.set(record.request.id, record);
    this.keyIndex.set(record.key, record.request.id);
    return record;
  }

  get(id: string): ApprovalRecord | undefined {
    return this.approvals.get(id);
  }

  findApprovedByKey(key: string): ApprovalRecord | undefined {
    const id = this.keyIndex.get(key);
    if (!id) {
      return undefined;
    }
    const record = this.approvals.get(id);
    if (!record) {
      return undefined;
    }
    return record.status === "APPROVED" ? record : undefined;
  }

  listPending(): ApprovalRecord[] {
    return Array.from(this.approvals.values()).filter(
      (record) => record.status === "PENDING"
    );
  }

  update(record: ApprovalRecord): void {
    this.approvals.set(record.request.id, record);
    this.keyIndex.set(record.key, record.request.id);
  }
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
  queue: ApprovalQueue,
  audit: AuditLogger,
  actor: string,
  key: string,
  action: string,
  target: string,
  payload?: unknown
): ApprovalRecord {
  const request = createApprovalRequest(
    { action, target, payload },
    { actor, audit }
  );
  const record: ApprovalRecord = {
    request,
    status: request.status,
    key,
    summary: summarizeApproval(action, target)
  };
  return queue.create(record);
}

function ensureApproved(
  queue: ApprovalQueue,
  key: string,
  approvalId?: string
): ApprovalRecord | undefined {
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

export function createDashboardServer(options?: {
  configPath?: string;
  actorDefault?: string;
  overrides?: RuntimeOverrides;
}) {
  const registry = buildRegistry();
  const governor = new Governor();
  const approvals = new ApprovalQueue();
  const overrides: RuntimeOverrides = options?.overrides ?? {};
  const actorDefault = options?.actorDefault ?? "dashboard";
  const version = loadVersion();
  const planStore = new Map<
    string,
    {
      plan: ReturnType<Planner["createPlan"]>;
      review: ReturnType<Manager["reviewPlan"]>;
    }
  >();

  return http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    const pathName = url.pathname;
    if (req.method === "GET" && serveStatic(res, pathName)) {
      return;
    }

    const config = buildRuntimeConfig(options?.configPath, overrides);
    const audit = new AuditLogger({
      logPath: config.audit.logPath,
      redactKeys: config.audit.redactKeys
    });

    if (req.method === "GET" && pathName === "/api/state") {
      return sendJson(res, 200, {
        networkEnabled: config.network.enabled,
        killSwitchEnabled: config.killSwitch.enabled,
        strictApprovalMode: config.governance.strictApprovalMode,
        actorDefault,
        version
      });
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

    if (req.method === "GET" && pathName === "/api/approvals") {
      const pending = approvals.listPending().map((record) => ({
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
        const record = approvals.get(approvalId);
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
        approvals.update(record);
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
        const planHash = hashPayload(plan);
        planStore.set(planHash, { plan, review });
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
          requiresApproval: review.approvalRequired
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
        const approvalKey = `exec:${planHash}`;
        if (stored.review.approvalRequired) {
          if (!approve) {
            const record = createPendingApproval(
              approvals,
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
              summary: record.summary
            });
          }
          const approvedRecord = ensureApproved(approvals, approvalKey, approvalId);
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
          results: execution.results
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
        const payloadHash = hashPayload(input);
        const approvalKey = `run:${skillName}:${payloadHash}`;
        if (approvalRequired) {
          if (!approve) {
            const record = createPendingApproval(
              approvals,
              audit,
              actor,
              approvalKey,
              "run",
              skillName,
              { input, skill: skillName }
            );
            return sendJson(res, 202, {
              status: "PENDING_APPROVAL",
              approvalId: record.request.id,
              summary: record.summary
            });
          }
          const approvedRecord = ensureApproved(approvals, approvalKey, approvalId);
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
            defenseText: JSON.stringify(input ?? {}),
            maturityLevel: 5,
            freshOwnerInput: true,
            costEstimateUsd: 0
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
          governor
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
            approvals,
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
        const approvedRecord = ensureApproved(approvals, approvalKey, approvalId);
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
            approvals,
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
        const approvedRecord = ensureApproved(approvals, approvalKey, approvalId);
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

export function startDashboardServer(options?: {
  port?: number;
  configPath?: string;
  actorDefault?: string;
}) {
  const server = createDashboardServer({
    configPath: options?.configPath,
    actorDefault: options?.actorDefault
  });
  const port = options?.port ?? DEFAULT_PORT;
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
