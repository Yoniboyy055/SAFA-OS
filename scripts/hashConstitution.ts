import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const CONSTITUTION_PATH = path.resolve(process.cwd(), "governor", "constitution.md");
const HASH_PATH = path.resolve(process.cwd(), "governor", "constitution.sha256");

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function main(): void {
  if (!fs.existsSync(CONSTITUTION_PATH)) {
    throw new Error("Constitution file is missing.");
  }
  const content = fs.readFileSync(CONSTITUTION_PATH, "utf8");
  const hash = hashValue(content);
  fs.writeFileSync(HASH_PATH, `${hash}\n`, "utf8");
  console.log(`OK: constitution hash updated: ${hash}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
