import * as http from "node:http";
import { loadConfig } from "../core/config";
import { AuditLogger } from "../core/audit";
import { parseCommandMode } from "../cli/command_mode";
import { AuthorityLevel } from "../core/authority";

type Logger = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

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

function resolveAuthority(flag?: string): AuthorityLevel | undefined {
  if (!flag) {
    return undefined;
  }
  return flag.toUpperCase() === AuthorityLevel.OWNER ? AuthorityLevel.OWNER : undefined;
}

function exitWith(
  message: string,
  code: number,
  logger: Logger,
  options?: { exit?: (code: number) => void }
): undefined {
  logger.error(message);
  if (options?.exit) {
    options.exit(code);
    return undefined;
  }
  process.exit(code);
  return undefined;
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

  const override = hasFlag(args, "--allow-dashboard-under-kill-switch");
  const approved = hasFlag(args, "--approve");
  const commandMode = parseCommandMode(getFlagValue(args, "--mode"));
  const authority = resolveAuthority(getFlagValue(args, "--authority"));

  if (config.killSwitch.enabled) {
    if (!override) {
      return exitWith(
        "DENIED: Kill switch is enabled. Dashboard is disabled by default.",
        1,
        logger,
        options
      );
    }
    if (!approved || commandMode !== "SCRIPT" || authority !== AuthorityLevel.OWNER) {
      return exitWith(
        "DENIED: Kill switch override requires --mode SCRIPT --authority OWNER --approve.",
        1,
        logger,
        options
      );
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
    return exitWith(
      "DENIED: Dashboard host must be 127.0.0.1.",
      1,
      logger,
      options
    );
  }
  const host = "127.0.0.1";
  const portRaw = getFlagValue(args, "--port");
  const parsedPort = portRaw ? Number(portRaw) : Number.NaN;
  const port = Number.isFinite(parsedPort) ? parsedPort : 3777;

  const server = http.createServer((req: any, res: any) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        status: "ok",
        path: req.url ?? "/"
      })
    );
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
