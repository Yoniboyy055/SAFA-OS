import * as fs from "node:fs";
import * as path from "node:path";

export interface ToolCatalogEntry {
  name: string;
  description: string;
  category: string;
  risk: string;
  requiresApproval: boolean;
  networkRequired: boolean;
  costNotes: string;
  privacyNotes: string;
}

export interface ToolCatalog {
  tools: ToolCatalogEntry[];
}

export function loadToolCatalog(rootDir: string): ToolCatalog {
  const catalogPath = path.join(rootDir, "tools", "tools.catalog.json");
  if (!fs.existsSync(catalogPath)) {
    throw new Error("Tool catalog not found.");
  }
  const raw = fs.readFileSync(catalogPath, "utf8");
  const parsed = JSON.parse(raw) as ToolCatalog;
  if (!parsed || !Array.isArray(parsed.tools)) {
    throw new Error("Invalid tool catalog format.");
  }
  return parsed;
}
