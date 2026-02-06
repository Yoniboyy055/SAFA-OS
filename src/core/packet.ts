import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface Packet {
  id: string;
  createdAt: string;
  mode?: string;
  payload?: Record<string, unknown>;
  jarvisLine?: string;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createPacket(
  rootDir: string,
  input: Omit<Packet, "id" | "createdAt">
): Packet {
  const createdAt = new Date().toISOString();
  const id = `pkt-${hashValue(`${createdAt}:${JSON.stringify(input)}`).slice(0, 12)}`;
  const packet: Packet = {
    id,
    createdAt,
    mode: input.mode,
    payload: input.payload,
    jarvisLine: input.jarvisLine
  };
  const dir = path.join(rootDir, "data", "packets");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(packet, null, 2), "utf8");
  return packet;
}

export function loadPacket(rootDir: string, id: string): Packet {
  const filePath = path.join(rootDir, "data", "packets", `${id}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Packet not found: ${id}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as Packet;
}
