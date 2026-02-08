import * as fs from "node:fs";
import * as path from "node:path";

import { loadConfig } from "../../../core/config";
import { AuditLogger } from "../../../core/audit";
import { ApprovalStore } from "../../../core/approval_store";
import {
  approveRequest,
  denyRequest,
  expireRequest,
  isExpired,
  type ApprovalRequest
} from "../../../core/approvals";
import {
  isNetworkWindowActive,
  loadNetworkWindow,
  type NetworkWindowState
} from "../../../core/network_window";
import { parseJarvisLine } from "../../../cli/jarvis_line";
import { runWithArgs } from "../../../cli/index";

export interface StatusSnapshot {
  networkEnabled: boolean;
  killSwitchEnabled: boolean;
  strictApprovalMode: boolean;
  networkWindow: NetworkWindowState;
  networkWindowActive: boolean;
  approvalsPending: number;
}

export interface RunResult {
  logs: string[];
  errors: string[];
  exitCode: number;
}

export class JarvisApi {
  constructor(
    private readonly options: { configPath?: string; actor: string }
  ) {}

  getStatus(): StatusSnapshot {
    const config = loadConfig(this.options.configPath);
    const store = new ApprovalStore(config.rootDir);
    const approvals = store.list();
    const pending = approvals.filter((request) => request.status === "PENDING");
    const window = loadNetworkWindow(config.rootDir);
    return {
      networkEnabled: config.network.enabled,
      killSwitchEnabled: config.killSwitch.enabled,
      strictApprovalMode: config.governance.strictApprovalMode,
      networkWindow: window,
      networkWindowActive: isNetworkWindowActive(window),
      approvalsPending: pending.length
    };
  }

  listApprovals(): ApprovalRequest[] {
    const config = loadConfig(this.options.configPath);
    const store = new ApprovalStore(config.rootDir);
    const audit = new AuditLogger({
      logPath: config.audit.logPath,
      redactKeys: config.audit.redactKeys
    });
    const updated: ApprovalRequest[] = [];
    for (const request of store.list()) {
      if (request.status === "PENDING" && isExpired(request)) {
        const expired = expireRequest(
          request,
          {
            actor: this.options.actor,
            audit
          },
          "Approval expired."
        );
        store.upsert(expired);
        updated.push(expired);
      } else {
        updated.push(request);
      }
    }
    return updated.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  approve(id: string): ApprovalRequest {
    const config = loadConfig(this.options.configPath);
    const store = new ApprovalStore(config.rootDir);
    const request = store.get(id);
    if (!request) {
      throw new Error(`Approval not found: ${id}`);
    }
    const audit = new AuditLogger({
      logPath: config.audit.logPath,
      redactKeys: config.audit.redactKeys
    });
    const approved = approveRequest(request, {
      actor: this.options.actor,
      audit
    });
    store.upsert(approved);
    return approved;
  }

  deny(id: string, reason: string): ApprovalRequest {
    const config = loadConfig(this.options.configPath);
    const store = new ApprovalStore(config.rootDir);
    const request = store.get(id);
    if (!request) {
      throw new Error(`Approval not found: ${id}`);
    }
    const audit = new AuditLogger({
      logPath: config.audit.logPath,
      redactKeys: config.audit.redactKeys
    });
    const denied = denyRequest(request, {
      actor: this.options.actor,
      audit
    }, reason);
    store.upsert(denied);
    return denied;
  }

  tailAudit(limit: number): string[] {
    const config = loadConfig(this.options.configPath);
    const logPath = config.audit.logPath;
    if (!fs.existsSync(logPath)) {
      return [];
    }
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .filter((line: string) => line.trim().length > 0);
    return lines.slice(Math.max(0, lines.length - limit));
  }

  async runLine(line: string): Promise<RunResult> {
    return this.runArgs(parseJarvisLine(line));
  }

  async runArgs(args: string[]): Promise<RunResult> {
    const argv = this.withDefaults(args);
    const logs: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...items) => logs.push(items.join(" "));
    console.error = (...items) => errors.push(items.join(" "));
    let exitCode = 0;
    try {
      await runWithArgs(argv, {
        exit: (code) => {
          exitCode = code;
        }
      });
    } catch (error) {
      if (!String(error).includes("__EXIT__")) {
        throw error;
      }
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    return { logs, errors, exitCode };
  }

  private withDefaults(args: string[]): string[] {
    const argv = [...args];
    if (this.options.actor && !argv.includes("--actor")) {
      argv.push("--actor", this.options.actor);
    }
    if (this.options.configPath && !argv.includes("--config")) {
      argv.push("--config", this.options.configPath);
    }
    return argv;
  }
}
