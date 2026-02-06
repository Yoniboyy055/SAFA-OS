import * as crypto from "node:crypto";

export interface ParsedJarvisLine {
  argv: string[];
  command: string;
  inputHash: string;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJsonBlock(input: string, start: number): { json: string; end: number } {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { json: input.slice(start, i + 1), end: i + 1 };
      }
    }
  }
  throw new Error("Unterminated JSON block.");
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
        quoteChar = "";
      } else {
        current += char;
      }
      i += 1;
      continue;
    }
    if (char === "\"" || char === "'") {
      inQuote = true;
      quoteChar = char;
      i += 1;
      continue;
    }
    if (char === "{") {
      if (current.trim().length > 0) {
        tokens.push(current.trim());
        current = "";
      }
      const block = readJsonBlock(input, i);
      tokens.push(block.json);
      i = block.end;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.trim().length > 0) {
        tokens.push(current.trim());
        current = "";
      }
      i += 1;
      continue;
    }
    current += char;
    i += 1;
  }
  if (current.trim().length > 0) {
    tokens.push(current.trim());
  }
  return tokens;
}

function parseJsonToken(token?: string): Record<string, unknown> | undefined {
  if (!token) {
    return undefined;
  }
  if (!token.startsWith("{")) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(token);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON input must be an object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid JSON input: ${String(error)}`);
  }
}

function consumeFlag(
  tokens: string[],
  flag: string
): { present: boolean; value?: string } {
  const index = tokens.indexOf(flag);
  if (index === -1) {
    return { present: false };
  }
  const value = tokens[index + 1];
  if (!value || value.startsWith("--")) {
    return { present: true };
  }
  tokens.splice(index, 2);
  return { present: true, value };
}

export function parseJarvisLine(line: string): string[] {
  const trimmed = line.trim();
  if (!/^jarvis:/i.test(trimmed)) {
    throw new Error("Line must start with JARVIS: prefix.");
  }
  const body = trimmed.replace(/^jarvis:/i, "").trim();
  if (!body) {
    throw new Error("Missing JARVIS command.");
  }
  const tokens = tokenize(body);
  const primary = tokens.shift();
  if (!primary) {
    throw new Error("Missing JARVIS command.");
  }

  const command = primary.toUpperCase();
  if (command === "RUN") {
    const skill = tokens.shift();
    if (!skill) {
      throw new Error("RUN requires a skill name.");
    }
    const jsonToken = tokens[0]?.startsWith("{") ? tokens.shift() : undefined;
    const input = parseJsonToken(jsonToken) ?? {};

    const approve = tokens.includes("--approve");
    const dryRun = tokens.includes("--dry-run");
    const explain = tokens.includes("--explain");
    const actor = consumeFlag(tokens, "--actor").value;
    const config = consumeFlag(tokens, "--config").value;
    const mode = consumeFlag(tokens, "--mode").value;
    const knownFlags = new Set(["--approve", "--dry-run", "--explain"]);
    const unknown = tokens.filter((token) => !knownFlags.has(token));
    if (unknown.length > 0) {
      throw new Error(`Unknown RUN flags: ${unknown.join(", ")}`);
    }

    if (dryRun) {
      input.dryRun = true;
    }
    if (explain) {
      input.explain = true;
    }

    const argv = ["run", skill];
    if (jsonToken || dryRun || explain) {
      argv.push("--input", JSON.stringify(input));
    }
    if (approve) {
      argv.push("--approve");
    }
    if (actor) {
      argv.push("--actor", actor);
    }
    if (config) {
      argv.push("--config", config);
    }
    argv.push("--mode", (mode ?? "SCRIPT").toUpperCase());
    argv.push("--authority", "OWNER");
    return argv;
  }

  if (command === "SKILLS") {
    return ["skills"];
  }

  if (command === "STATUS") {
    return ["status"];
  }

  if (command === "APPROVALS") {
    const sub = (tokens.shift() ?? "").toUpperCase();
    if (!sub) {
      throw new Error("APPROVALS requires a subcommand.");
    }
    if (sub === "LIST") {
      return ["approvals", "list"];
    }
    if (sub === "SHOW") {
      const id = tokens.shift();
      if (!id) {
        throw new Error("APPROVALS SHOW requires an id.");
      }
      return ["approvals", "show", id];
    }
    if (sub === "APPROVE") {
      const id = tokens.shift();
      if (!id) {
        throw new Error("APPROVALS APPROVE requires an id.");
      }
      const actor = consumeFlag(tokens, "--actor").value;
      const argv = ["approvals", "approve", id];
      if (actor) {
        argv.push("--actor", actor);
      }
      return argv;
    }
    if (sub === "DENY") {
      const id = tokens.shift();
      if (!id) {
        throw new Error("APPROVALS DENY requires an id.");
      }
      const actor = consumeFlag(tokens, "--actor").value;
      const reason = consumeFlag(tokens, "--reason").value;
      const argv = ["approvals", "deny", id];
      if (actor) {
        argv.push("--actor", actor);
      }
      if (reason) {
        argv.push("--reason", reason);
      }
      return argv;
    }
    throw new Error(`Unknown approvals subcommand: ${sub}`);
  }

  if (command === "AUDIT") {
    const sub = (tokens.shift() ?? "").toUpperCase();
    if (sub !== "TAIL") {
      throw new Error("AUDIT requires TAIL subcommand.");
    }
    const count = consumeFlag(tokens, "--n").value ?? "50";
    return ["audit", "tail", "--n", count];
  }

  if (command === "PACKET") {
    const sub = (tokens.shift() ?? "").toUpperCase();
    if (sub === "CREATE") {
      const mode = consumeFlag(tokens, "--mode").value;
      const payloadToken = tokens.find((token) => token.startsWith("{"));
      const payload = payloadToken ? parseJsonToken(payloadToken) : undefined;
      const argv = ["packet", "create"];
      if (mode) {
        argv.push("--mode", mode);
      }
      if (payload) {
        argv.push("--payload", JSON.stringify(payload));
      }
      return argv;
    }
    if (sub === "APPLY") {
      const id = tokens.shift();
      if (!id) {
        throw new Error("PACKET APPLY requires an id.");
      }
      const argv = ["packet", "apply", id];
      if (tokens.includes("--dry-run")) {
        argv.push("--dry-run");
      }
      if (tokens.includes("--explain")) {
        argv.push("--explain");
      }
      return argv;
    }
    throw new Error(`Unknown packet subcommand: ${sub}`);
  }

  throw new Error(`Unknown JARVIS command: ${command}`);
}

export function summarizeJarvisLine(line: string): ParsedJarvisLine {
  const argv = parseJarvisLine(line);
  return {
    argv,
    command: argv[0] ?? "unknown",
    inputHash: hashValue(line)
  };
}
