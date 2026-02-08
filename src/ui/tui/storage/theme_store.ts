import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const FILE_NAME = ".safa-ui.json";

function tryRead(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function tryWrite(filePath: string, content: string): boolean {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

function resolvePaths(): string[] {
  const cwdPath = path.join(process.cwd(), FILE_NAME);
  const homePath = path.join(os.homedir(), ".safa-os", FILE_NAME);
  return [cwdPath, homePath];
}

export function loadThemePreference(): string | undefined {
  for (const filePath of resolvePaths()) {
    const raw = tryRead(filePath);
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as { theme?: string };
      if (parsed && typeof parsed.theme === "string") {
        return parsed.theme;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

export function saveThemePreference(theme: string): void {
  const payload = JSON.stringify({ theme }, null, 2);
  for (const filePath of resolvePaths()) {
    if (tryWrite(filePath, payload)) {
      return;
    }
  }
}
