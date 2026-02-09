import * as http from "node:http";
import * as path from "node:path";

import { createDashboardServer } from "../dashboard/server";
import { verifyConstitutionOrExit } from "../core/constitution";
import { TriggerService } from "./trigger_service";
import { loadConfig } from "../core/config";
import { AuditLogger } from "../core/audit";
import { Governor } from "../core/governor";

const DEFAULT_DASHBOARD_PORT = 3777;
const DEFAULT_HEALTH_PORT = 3778;
const HOST = "127.0.0.1";

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve) => {
    server.listen(port, HOST, resolve);
  });
}

async function startHealthServer(
  port: number,
  dashboardPort: number,
  startedAt: string
): Promise<http.Server> {
  const server = http.createServer((req: any, res: any) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    if (req.method === "GET" && url.pathname === "/health") {
      const payload = JSON.stringify({
        status: "ok",
        dashboardPort,
        startedAt
      });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      });
      res.end(payload);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });
  await listen(server, port);
  return server;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`SAFA daemon

Usage:
  node dist/daemon/daemon.js [--dashboard-port 3777] [--health-port 3778] [--config <path>] [--actor <name>]
`);
    return;
  }

  const dashboardPort = parsePort(
    getArgValue(args, "--dashboard-port"),
    DEFAULT_DASHBOARD_PORT
  );
  const healthPort = parsePort(
    getArgValue(args, "--health-port"),
    DEFAULT_HEALTH_PORT
  );
  const configPath = getArgValue(args, "--config");
  const actorDefault = getArgValue(args, "--actor") ?? "daemon";

  verifyConstitutionOrExit(actorDefault);

  const startedAt = new Date().toISOString();
  const dashboardServer = createDashboardServer({
    configPath,
    actorDefault
  });
  await listen(dashboardServer, dashboardPort);
  const healthServer = await startHealthServer(
    healthPort,
    dashboardPort,
    startedAt
  );

  // Initialize trigger service
  let triggerService: TriggerService | undefined;
  try {
    const resolvedConfigPath = configPath ?? path.join(process.cwd(), "safa.config.json");
    const config = loadConfig(resolvedConfigPath);
    const audit = new AuditLogger(config.audit);
    const governor = new Governor();
    
    triggerService = new TriggerService(config, audit, governor, actorDefault);
    triggerService.start();
    
    console.log("Trigger service initialized and started");
  } catch (error) {
    console.warn(
      "Failed to initialize trigger service. Daemon will continue without proactive automation.",
      error instanceof Error ? error.message : String(error)
    );
  }

  console.log(
    `Daemon started. Dashboard http://${HOST}:${dashboardPort} | Health http://${HOST}:${healthPort}/health`
  );

  const shutdown = () => {
    if (triggerService) {
      triggerService.stop();
    }
    dashboardServer.close();
    healthServer.close();
  };
  const processWithSignals = process as unknown as {
    on: (event: string, handler: () => void) => void;
  };
  processWithSignals.on("SIGINT", shutdown);
  processWithSignals.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
