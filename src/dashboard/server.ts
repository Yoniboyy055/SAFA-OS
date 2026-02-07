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
import { readFreezeState } from "../core/freeze";
import type { FreezeState } from "../core/freeze";
import { getLayerDefinitions } from "../core/layers";
import {
  getPhase7bLockMessage,
  isPhase7bLockedSkill
} from "../core/phase7b/locked";

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
    return 1;
  }
  if (
    skill.category === "network" ||
    skill.category === "external_tool" ||
    skill.category === "outbound_message"
  ) {
    return 3;
  }
  return 2;
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

function renderDashboardUi(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JARVAS OS</title>
  <style>
    body {
      font-family: "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #0f172a 0%, #020617 60%);
      color: #e6e6e6;
      margin: 0;
      min-height: 100vh;
    }
    header {
      padding: 24px 32px;
      background: rgba(15, 23, 42, 0.9);
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      position: sticky;
      top: 0;
      backdrop-filter: blur(12px);
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
      border-color: #2563eb;
      color: #93c5fd;
      background: rgba(37, 99, 235, 0.15);
    }
    main { padding: 24px 32px; display: grid; gap: 16px; }
    .card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 14px;
      padding: 16px;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 10px 30px rgba(2, 6, 23, 0.4);
      backdrop-filter: blur(12px);
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 18px 40px rgba(2, 6, 23, 0.55); }
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
    .badge.safe { border-color: #2563eb; color: #93c5fd; }
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
      background: #2563eb;
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.2s ease;
    }
    button:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35); }
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
  </style>
</head>
<body>
  <header>
    <div class="header-row">
      <div>
        <h1>JARVAS OS</h1>
        <div class="subtitle">Governed Command Center</div>
      </div>
      <div id="safeBanner" class="banner">SAFE MODE — Kill Switch Enabled</div>
    </div>
  </header>
  <main>
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
    <div class="card">
      <div class="label">Command Console (Dry-Run)</div>
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
          <label class="label">Owner Token</label>
          <input type="password" id="tokenInput" placeholder="X-Owner-Token" />
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
    <div class="card">
      <div class="label">Activity / Audit Feed</div>
      <div class="feed" id="auditFeed"></div>
    </div>
    <div class="card">
      <div class="label">Response</div>
      <pre id="responsePanel">{}</pre>
    </div>
  </main>
  <script>
    function renderBadge(label, className) {
      const span = document.createElement("span");
      span.className = "badge " + (className || "");
      span.textContent = label;
      return span;
    }
    async function loadStatus() {
      const res = await fetch("/status");
      const data = await res.json();
      const statusEl = document.getElementById("status");
      statusEl.innerHTML = \`
        <div>killSwitchEnabled: <strong>\${data.killSwitchEnabled}</strong></div>
        <div>networkEnabled: <strong>\${data.networkEnabled}</strong></div>
        <div>strictApprovalMode: <strong>\${data.strictApprovalMode}</strong></div>
        <div>freezeEnabled: <strong>\${data.freezeEnabled}</strong></div>
        <div>phase: <strong>\${data.phase}</strong></div>
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
        const title = [skill.description, skill.lockReason].filter(Boolean).join(" — ");
        const enabledLabel = skill.enabled ? "ENABLED" : "DISABLED";
        return \`
          <tr title="\${title}">
            <td>\${skill.name}</td>
            <td>\${skill.riskLevel}</td>
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
    async function sendCommand(lineOverride) {
      const token = document.getElementById("tokenInput").value.trim();
      const line = typeof lineOverride === "string"
        ? lineOverride
        : document.getElementById("commandInput").value.trim();
      const mode = document.getElementById("modeSelect").value;
      const authority = document.getElementById("authoritySelect").value;
      const approve = document.getElementById("approveCheck").checked;
      const evidenceMode = document.getElementById("evidenceCheck").checked;
      const shadowRun = document.getElementById("shadowCheck").checked;
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
          dryRun: true,
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
    }
    document.getElementById("sendBtn").addEventListener("click", sendCommand);
    document.getElementById("freezeBtn").addEventListener("click", () => {
      sendCommand('JARVIS: RUN freeze_system {"reason":"dashboard"}');
    });
    document.getElementById("unfreezeBtn").addEventListener("click", () => {
      sendCommand('JARVIS: RUN unfreeze_system {"reason":"dashboard"} --approve');
    });
    document.getElementById("commandInput").addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === "Enter") {
        sendCommand();
      }
    });
    loadStatus();
    loadSkills();
  </script>
</body>
</html>`;
}

function sanitizedStatus(
  config: ResolvedConfig,
  freezeState?: FreezeState
): Record<string, unknown> {
  const freeze = freezeState ?? readFreezeState(config.rootDir);
  return {
    networkEnabled: config.network.enabled,
    killSwitchEnabled: config.killSwitch.enabled,
    strictApprovalMode: config.governance.strictApprovalMode,
    phase: "7A",
    phase7b: "LOCKED",
    phase7c: "PLANNED",
    safeMode: config.killSwitch.enabled,
    freezeEnabled: freeze.enabled,
    freezeReason: freeze.reason ?? null,
    evidenceMode: true,
    shadowRun: true,
    layers: getLayerDefinitions()
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
          if (!dryRun) {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: false,
              target: "command",
              result: "DENIED: Dashboard only supports dry-run."
            });
            return sendJson(res, 400, {
              ok: false,
              denied: true,
              reason: "Dashboard only supports dry-run.",
              auditId
            });
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
          let packet: Record<string, unknown> = {
            id: `packet-${Date.now()}`,
            command: summary.command,
            argv: sanitizeArgv(argv),
            inputHash: summary.inputHash,
            dryRun: true,
            shadowRun,
            evidenceMode
          };
          let isReadOnly = summary.command === "status" || summary.command === "skills";
          let executedControl = false;
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
            const input = extractInputFromArgs(argv);
            input.dryRun = true;
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
            isReadOnly =
              skill.category === "local" &&
              skill.riskLevel === "LOW" &&
              skill.requiresApproval === false;

            if (config.killSwitch.enabled && !isReadOnly && !isControlAction) {
              decision = {
                allowed: false,
                reason: "Kill switch safe mode allows read-only dry-runs only."
              };
            } else {
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
            }
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
            }

            preview = {
              skill: skill.name,
              dryRun: true,
              shadowRun,
              note: isControlAction
                ? "Control action executed (freeze safety override)."
                : "Simulation only; no execution from dashboard.",
              controlResult
            };
          }

          if (config.killSwitch.enabled && !isReadOnly && decision.allowed && !executedControl) {
            decision = {
              allowed: false,
              reason: "Kill switch safe mode allows read-only dry-runs only."
            };
          }

          const allowed = decision.allowed === true;
          const reason = allowed ? "" : decision.reason;
          const touched =
            summary.command === "run" && packet && "skill" in packet
              ? summarizeTouchedTargets(String(packet.skill ?? ""), extractInputFromArgs(argv))
              : [];
          const evidence = {
            intent: summary.command,
            outcome: allowed ? "ALLOWED" : "DENIED",
            decision: decision.reason,
            wouldHappen: "Dry-run preview only. No execution.",
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
            redacted: true,
            shadowRun,
            evidenceMode,
            freezeUpdated: executedControl,
            freezeState: executedControl ? nextFreezeState : undefined
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
    if (options?.exit) {
      options.exit(1);
      return undefined;
    }
    process.exit(1);
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
