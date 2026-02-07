import * as http from "node:http";

import { loadConfig } from "../core/config";
import type { ResolvedConfig } from "../core/config";
import { AuditLogger } from "../core/audit";
import { Governor } from "../core/governor";
import { parseCommandMode } from "../cli/command_mode";
import { summarizeJarvisLine } from "../cli/jarvis_line";
import { AuthorityLevel } from "../core/authority";
import { buildRegistry } from "../skills/registry_factory";
import type { SkillDefinition } from "../types/skill";

type Logger = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const MAX_BODY_BYTES = 16 * 1024;

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function resolveHeaderValue(
  value: string | string[] | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function resolveAuthority(flag?: string): AuthorityLevel | undefined {
  if (!flag) {
    return undefined;
  }
  return flag.toUpperCase() === AuthorityLevel.OWNER ? AuthorityLevel.OWNER : undefined;
}

function readRequestBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: unknown) => {
      body += String(chunk);
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("Payload too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: any, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function ensureFlag(argv: string[], flag: string, value?: string): void {
  if (!value) {
    return;
  }
  if (argv.includes(flag)) {
    return;
  }
  argv.push(flag, value);
}

function ensureBooleanFlag(argv: string[], flag: string, enabled: boolean): void {
  if (enabled && !argv.includes(flag)) {
    argv.push(flag);
  }
}

function extractInputFromArgs(argv: string[]): Record<string, unknown> {
  const inputIndex = argv.indexOf("--input");
  if (inputIndex === -1 || inputIndex + 1 >= argv.length) {
    return {};
  }
  try {
    const parsed = JSON.parse(argv[inputIndex + 1]);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function updateInputArg(argv: string[], input: Record<string, unknown>): void {
  const inputIndex = argv.indexOf("--input");
  const payload = JSON.stringify(input);
  if (inputIndex === -1) {
    argv.push("--input", payload);
    return;
  }
  argv[inputIndex + 1] = payload;
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

function renderDashboardUi(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JARVIS OS</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; background: #0b0e14; color: #e6e6e6; margin: 0; }
    header { padding: 24px 32px; background: #111827; border-bottom: 1px solid #1f2937; }
    h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
    main { padding: 24px 32px; display: grid; gap: 16px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .label { font-size: 12px; color: #9ca3af; text-transform: uppercase; }
    textarea, input, select { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #374151; background: #0f172a; color: #e5e7eb; }
    button { background: #2563eb; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; }
    button:disabled { background: #4b5563; }
    pre { background: #0f172a; padding: 12px; border-radius: 8px; overflow: auto; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; background: #1f2937; }
  </style>
</head>
<body>
  <header>
    <h1>JARVIS OS</h1>
  </header>
  <main>
    <div class="grid">
      <div class="card">
        <div class="label">Status</div>
        <div id="status">Loading...</div>
      </div>
      <div class="card">
        <div class="label">Audit</div>
        <div class="pill">All requests are logged. Secrets redacted.</div>
      </div>
    </div>
    <div class="card">
      <div class="label">Skills</div>
      <div id="skills">Loading...</div>
    </div>
    <div class="card">
      <div class="label">Command Console</div>
      <textarea id="commandInput" rows="4" placeholder="JARVIS: STATUS"></textarea>
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
          <label class="label">Real Run (Local Only)</label>
          <input type="checkbox" id="realRunCheck" />
        </div>
        <div>
          <label class="label">Owner Token</label>
          <input type="password" id="tokenInput" placeholder="X-Owner-Token" />
        </div>
      </div>
      <button id="sendBtn" style="margin-top:12px;">Send</button>
    </div>
    <div class="card">
      <div class="label">Response</div>
      <pre id="responsePanel">{}</pre>
    </div>
  </main>
  <script>
    async function loadStatus() {
      const res = await fetch("/status");
      const data = await res.json();
      document.getElementById("status").textContent =
        "killSwitch=" + data.killSwitchEnabled +
        " | network=" + data.networkEnabled +
        " | strictApproval=" + data.strictApprovalMode;
    }
    async function loadSkills() {
      const res = await fetch("/skills");
      const data = await res.json();
      document.getElementById("skills").textContent = JSON.stringify(data, null, 2);
    }
    async function sendCommand() {
      const token = document.getElementById("tokenInput").value.trim();
      const line = document.getElementById("commandInput").value.trim();
      const mode = document.getElementById("modeSelect").value;
      const authority = document.getElementById("authoritySelect").value;
      const approve = document.getElementById("approveCheck").checked;
      const realRun = document.getElementById("realRunCheck").checked;
      const res = await fetch("/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Owner-Token": token
        },
        body: JSON.stringify({
          line,
          mode,
          authority,
          approve,
          dryRun: !realRun
        })
      });
      const data = await res.json();
      document.getElementById("responsePanel").textContent = JSON.stringify(data, null, 2);
    }
    document.getElementById("sendBtn").addEventListener("click", sendCommand);
    loadStatus();
    loadSkills();
  </script>
</body>
</html>`;
}

function sanitizedStatus(config: ResolvedConfig): Record<string, unknown> {
  return {
    networkEnabled: config.network.enabled,
    killSwitchEnabled: config.killSwitch.enabled,
    strictApprovalMode: config.governance.strictApprovalMode
  };
}

export function createDashboardServer(
  config: ResolvedConfig,
  deps: {
    ownerToken: string;
    actor?: string;
    logger?: Logger;
    audit?: AuditLogger;
  }
): any {
  const logger = deps.logger ?? console;
  const actor = deps.actor ?? "local-owner";
  const audit =
    deps.audit ??
    new AuditLogger({ logPath: config.audit.logPath, redactKeys: config.audit.redactKeys });
  const registry = buildRegistry();
  const governor = new Governor();
  const ownerToken = deps.ownerToken;

  return http.createServer((req: any, res: any) => {
    const pathName = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && (pathName === "/" || pathName === "/ui")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(renderDashboardUi());
      return;
    }
    if (req.method === "GET" && pathName === "/health") {
      return sendJson(res, 200, { status: "ok" });
    }
    if (req.method === "GET" && pathName === "/status") {
      return sendJson(res, 200, sanitizedStatus(config));
    }
    if (req.method === "GET" && pathName === "/skills") {
      const skills = registry.list().map((skill) => ({
        name: skill.name,
        riskLevel: skill.riskLevel,
        requiresApproval: skill.requiresApproval,
        allowWhenNetworkOff: skill.allowWhenNetworkOff
      }));
      return sendJson(res, 200, { skills });
    }
    if (req.method === "POST" && pathName === "/command") {
      const token = resolveHeaderValue(req.headers["x-owner-token"]);
      if (!token || token !== ownerToken) {
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "dashboard.command",
          approved: false,
          target: "command",
          result: "DENIED: Unauthorized."
        });
        return sendJson(res, 401, { ok: false, denied: true, reason: "Unauthorized." });
      }
      readRequestBody(req)
        .then(async (body) => {
          let payload: {
            line?: string;
            text?: string;
            mode?: string;
            authority?: string;
            approve?: boolean;
            dryRun?: boolean;
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

          const line = (payload.line ?? payload.text ?? "").trim();
          const dryRun = payload.dryRun !== false;
          const auditId = `dash-${Date.now()}`;

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
            summary = summarizeJarvisLine(line);
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

          if (summary.command === "status") {
            const response = {
              ok: true,
              denied: false,
              decision: { allowed: true, reason: "Allowed." },
              preview: sanitizedStatus(config),
              auditId
            };
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: approvedFlag,
              target: summary.command,
              result: JSON.stringify({ inputHash: summary.inputHash, auditId })
            });
            return sendJson(res, 200, response);
          }

          if (summary.command === "skills") {
            const skills = registry.list().map((skill) => ({
              name: skill.name,
              riskLevel: skill.riskLevel,
              requiresApproval: skill.requiresApproval,
              allowWhenNetworkOff: skill.allowWhenNetworkOff
            }));
            const response = {
              ok: true,
              denied: false,
              decision: { allowed: true, reason: "Allowed." },
              preview: { skills },
              auditId
            };
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: approvedFlag,
              target: summary.command,
              result: JSON.stringify({ inputHash: summary.inputHash, auditId })
            });
            return sendJson(res, 200, response);
          }

          if (summary.command !== "run") {
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

          const input = extractInputFromArgs(argv);
          const isLocalSkill = skill.category === "local";

          if (!dryRun && !isLocalSkill) {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: approvedFlag,
              target: skillName,
              result: "DENIED: Dashboard real-run is only allowed for LOCAL skills."
            });
            return sendJson(res, 400, {
              ok: false,
              denied: true,
              reason: "Dashboard real-run is only allowed for LOCAL skills.",
              auditId
            });
          }

          if (dryRun) {
            input.dryRun = true;
          }
          updateInputArg(argv, input);

          let decision;
          try {
            const allowWhenNetworkOff = buildAllowWhenNetworkOff(skill, input);
            decision = governor.evaluate(
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
                approved: approvedFlag,
                authority,
                commandMode,
                audit,
                defenseText:
                  skill.name === "analyze_input_risk"
                    ? ""
                    : JSON.stringify(input ?? {}),
                maturityLevel: 5,
                freshOwnerInput: true,
                costEstimateUsd: 0
              },
              buildNetworkRequest(skill, input)
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: approvedFlag,
              target: skillName,
              result: JSON.stringify({ inputHash: summary.inputHash, error: message })
            });
            return sendJson(res, 400, {
              ok: false,
              denied: true,
              reason: message,
              auditId
            });
          }

          const allowed = decision.allowed === true;

          if (allowed && !dryRun && isLocalSkill) {
            try {
              const result = await registry.execute(skillName, input, {
                actor,
                approved: approvedFlag,
                authority,
                commandMode,
                config,
                audit,
                governor
              });
              audit.log({
                timestamp: new Date().toISOString(),
                actor,
                action: "dashboard.command.execute",
                approved: approvedFlag,
                target: skillName,
                result: JSON.stringify({
                  inputHash: summary.inputHash,
                  auditId,
                  success: result.success
                })
              });
              return sendJson(res, result.success ? 200 : 500, {
                ok: result.success,
                denied: false,
                decision,
                output: result.output ?? null,
                error: result.error ?? undefined,
                auditId
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              audit.log({
                timestamp: new Date().toISOString(),
                actor,
                action: "dashboard.command.execute",
                approved: approvedFlag,
                target: skillName,
                result: JSON.stringify({ inputHash: summary.inputHash, error: message })
              });
              return sendJson(res, 500, {
                ok: false,
                denied: false,
                reason: message,
                auditId
              });
            }
          }

          const preview = {
            skill: skill.name,
            dryRun: true,
            inputKeys: Object.keys(input),
            note: "Simulation only; no execution from dashboard."
          };
          audit.log({
            timestamp: new Date().toISOString(),
            actor,
            action: "dashboard.command",
            approved: approvedFlag,
            target: skillName,
            result: JSON.stringify({
              inputHash: summary.inputHash,
              auditId,
              decision: decision.reason
            })
          });
          return sendJson(res, allowed ? 200 : 403, {
            ok: allowed,
            denied: !allowed,
            reason: allowed ? "" : decision.reason,
            decision,
            preview,
            auditId
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          audit.log({
            timestamp: new Date().toISOString(),
            actor,
            action: "dashboard.command",
            approved: false,
            target: "command",
            result: `ERROR: ${message}`
          });
          return sendJson(res, 413, { ok: false, denied: true, reason: message });
        });
      return;
    }
    return sendJson(res, 404, { error: "Not found." });
  });
}

export async function startDashboardServer(
  rawArgs: string[] = process.argv.slice(2),
  options?: { exit?: (code: number) => void; logger?: Logger }
): Promise<any> {
  const logger = options?.logger ?? console;
  const args = [...rawArgs];
  const configPath = getFlagValue(args, "--config");
  const actor = getFlagValue(args, "--actor") ?? "local-owner";
  const config = loadConfig(configPath);
  const audit = new AuditLogger({
    logPath: config.audit.logPath,
    redactKeys: config.audit.redactKeys
  });

  const ownerToken = process.env.JARVIS_OWNER_TOKEN;
  if (!ownerToken) {
    logger.error("DENIED: JARVIS_OWNER_TOKEN is required to start the dashboard.");
    if (options?.exit) {
      options.exit(1);
      return undefined;
    }
    process.exit(1);
  }

  const override = hasFlag(args, "--allow-dashboard-under-kill-switch");
  if (override) {
    const approved = hasFlag(args, "--approve");
    const commandMode = parseCommandMode(getFlagValue(args, "--mode"));
    const authority = resolveAuthority(getFlagValue(args, "--authority"));
    if (!approved || commandMode !== "SCRIPT" || authority !== AuthorityLevel.OWNER) {
      logger.error(
        "DENIED: Kill switch override requires --mode SCRIPT --authority OWNER --approve."
      );
      if (options?.exit) {
        options.exit(1);
        return undefined;
      }
      process.exit(1);
    }
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "dashboard.start.override_killswitch",
      approved: true,
      target: "dashboard",
      result: "SUCCESS"
    });
  }

  const hostFlag = getFlagValue(args, "--host");
  if (hostFlag && hostFlag !== "127.0.0.1") {
    logger.error("DENIED: Dashboard host must be 127.0.0.1.");
    if (options?.exit) {
      options.exit(1);
      return undefined;
    }
    process.exit(1);
  }
  const host = "127.0.0.1";
  const portRaw = getFlagValue(args, "--port");
  const parsedPort = portRaw ? Number(portRaw) : Number.NaN;
  const port = Number.isFinite(parsedPort) ? parsedPort : 3777;

  const server = createDashboardServer(config, {
    ownerToken,
    actor,
    logger,
    audit
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const address = server.address();
  const resolvedPort =
    address && typeof address === "object" && "port" in address
      ? address.port
      : port;
  logger.log(`Dashboard listening on http://${host}:${resolvedPort}`);
  return server;
}

async function main(): Promise<void> {
  await startDashboardServer();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
