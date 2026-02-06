import * as http from "node:http";
import { loadConfig } from "../core/config";
import { AuditLogger } from "../core/audit";
import { parseCommandMode } from "../cli/command_mode";
import { summarizeJarvisLine } from "../cli/jarvis_line";
import { runWithArgs } from "../cli/index";
import { AuthorityLevel } from "../core/authority";

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

function hasOwnerAuthority(argv: string[]): boolean {
  const index = argv.indexOf("--authority");
  if (index === -1) {
    return false;
  }
  const value = argv[index + 1];
  return value ? value.toUpperCase() === AuthorityLevel.OWNER : false;
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

async function runCommand(argv: string[]): Promise<{
  exitCode: number;
  stdout: string[];
  stderr: string[];
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  let exitCode = 0;

  console.log = (...args: unknown[]) => {
    stdout.push(args.map((arg) => String(arg)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map((arg) => String(arg)).join(" "));
  };

  try {
    await runWithArgs(argv, {
      exit: (code: number) => {
        exitCode = code;
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith("__EXIT__")) {
      stderr.push(message);
      exitCode = exitCode === 0 ? 1 : exitCode;
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { exitCode, stdout, stderr };
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

  const ownerToken = process.env.JARVIS_OWNER_TOKEN;
  if (!ownerToken) {
    return exitWith(
      "DENIED: JARVIS_OWNER_TOKEN is required to start the dashboard.",
      1,
      logger,
      options
    );
  }

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
    const pathName = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && pathName === "/health") {
      return sendJson(res, 200, { status: "ok" });
    }
    if (req.method === "GET" && pathName === "/status") {
      return sendJson(res, 200, {
        networkEnabled: config.network.enabled,
        killSwitchEnabled: config.killSwitch.enabled,
        strictApprovalMode: config.governance.strictApprovalMode,
        configPath: config.configPath
      });
    }
    if (req.method === "POST" && pathName === "/command") {
      const headerToken = resolveHeaderValue(
        req.headers["x-jarvis-owner-token"]
      );
      const authHeader = resolveHeaderValue(req.headers.authorization);
      const bearer =
        authHeader && authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7)
          : undefined;
      const token = headerToken ?? bearer;

      if (!token || token !== ownerToken) {
        audit.log({
          timestamp: new Date().toISOString(),
          actor,
          action: "dashboard.command",
          approved: false,
          target: "command",
          result: "DENIED: Unauthorized."
        });
        return sendJson(res, 401, { error: "Unauthorized." });
      }

      readRequestBody(req)
        .then(async (body) => {
          let line = body.trim();
          if (line.startsWith("{")) {
            try {
              const parsed = JSON.parse(line) as { line?: string };
              if (parsed && typeof parsed.line === "string") {
                line = parsed.line.trim();
              }
            } catch (error) {
              audit.log({
                timestamp: new Date().toISOString(),
                actor,
                action: "dashboard.command",
                approved: false,
                target: "command",
                result: "ERROR: Invalid JSON payload."
              });
              return sendJson(res, 400, { error: "Invalid JSON payload." });
            }
          }
          if (!line) {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: false,
              target: "command",
              result: "ERROR: Missing command."
            });
            return sendJson(res, 400, { error: "Missing command." });
          }

          let summary;
          try {
            summary = summarizeJarvisLine(line);
          } catch (error) {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: false,
              target: "command",
              result: `ERROR: ${error instanceof Error ? error.message : String(error)}`
            });
            return sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error)
            });
          }

          if (!hasOwnerAuthority(summary.argv)) {
            audit.log({
              timestamp: new Date().toISOString(),
              actor,
              action: "dashboard.command",
              approved: false,
              target: summary.command,
              result: JSON.stringify({
                inputHash: summary.inputHash,
                error: "Owner authority is required."
              })
            });
            return sendJson(res, 403, {
              error: "Owner authority is required via --authority OWNER."
            });
          }

          const approvedFlag = summary.argv.includes("--approve");
          const execution = await runCommand(summary.argv);
          audit.log({
            timestamp: new Date().toISOString(),
            actor,
            action: "dashboard.command",
            approved: approvedFlag,
            target: summary.command,
            result: JSON.stringify({
              inputHash: summary.inputHash,
              exitCode: execution.exitCode
            })
          });

          return sendJson(res, execution.exitCode === 0 ? 200 : 400, {
            ok: execution.exitCode === 0,
            exitCode: execution.exitCode,
            stdout: execution.stdout,
            stderr: execution.stderr
          });
        })
        .catch((error) => {
          audit.log({
            timestamp: new Date().toISOString(),
            actor,
            action: "dashboard.command",
            approved: false,
            target: "command",
            result: `ERROR: ${error instanceof Error ? error.message : String(error)}`
          });
          return sendJson(res, 413, {
            error: error instanceof Error ? error.message : String(error)
          });
        });
      return;
    }
    return sendJson(res, 404, { error: "Not found." });
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
