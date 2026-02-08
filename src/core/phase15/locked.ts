import * as fs from "node:fs";
import * as path from "node:path";

import type { NetworkWindowState } from "../network_window";
import { openNetworkWindow } from "../network_window";

export interface LiveProviderRegistration {
  configPath: string;
  domains: string[];
  urls?: string[];
}

export interface LiveProviderRegistrationResult {
  configPath: string;
  allowlistDomains: string[];
  allowlistUrls: string[];
}

export function activateNetworkWindow(
  rootDir: string,
  hours: number,
  actor: string
): NetworkWindowState {
  return openNetworkWindow(rootDir, hours, actor);
}

function normalizeValues(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

export function registerLiveProvider(
  registration: LiveProviderRegistration
): LiveProviderRegistrationResult {
  const resolvedPath = path.resolve(process.cwd(), registration.configPath);
  const raw = fs.existsSync(resolvedPath)
    ? fs.readFileSync(resolvedPath, "utf8")
    : "{}";
  const parsed = raw.trim().length ? JSON.parse(raw) : {};
  const network = parsed.network ?? {};
  const allowlistDomains = normalizeValues(network.allowlistDomains);
  const allowlistUrls = normalizeValues(network.allowlistUrls);
  const domainSet = new Set(allowlistDomains);
  const urlSet = new Set(allowlistUrls);

  normalizeValues(registration.domains).forEach((domain) => domainSet.add(domain));
  normalizeValues(registration.urls).forEach((url) => urlSet.add(url));

  const nextNetwork = {
    ...network,
    allowlistDomains: Array.from(domainSet),
    allowlistUrls: Array.from(urlSet)
  };
  const nextConfig = { ...parsed, network: nextNetwork };

  fs.writeFileSync(resolvedPath, JSON.stringify(nextConfig, null, 2), "utf8");

  return {
    configPath: resolvedPath,
    allowlistDomains: nextNetwork.allowlistDomains,
    allowlistUrls: nextNetwork.allowlistUrls
  };
}

export function getPhase15LockMessage(): string {
  return "PHASE_15_ACTIVE";
}
