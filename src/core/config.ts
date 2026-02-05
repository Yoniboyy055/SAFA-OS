const fs = require("fs");
const path = require("path");

export interface NetworkConfig {
  enabled: boolean;
  allowlist: string[];
}

export interface TelemetryConfig {
  enabled: boolean;
}

export interface KillSwitchConfig {
  enabled: boolean;
}

export interface AuditConfig {
  logPath: string;
  redactKeys: string[];
}

export interface GovernanceConfig {
  strictApprovalMode: boolean;
}

export interface PermissionsConfig {
  writeAllowlist: string[];
  readAllowlist: string[];
}

export interface JarvisConfig {
  network: NetworkConfig;
  telemetry: TelemetryConfig;
  killSwitch: KillSwitchConfig;
  governance: GovernanceConfig;
  audit: AuditConfig;
  permissions: PermissionsConfig;
}

export interface ResolvedConfig extends JarvisConfig {
  configPath: string;
  rootDir: string;
}

const DEFAULT_CONFIG: JarvisConfig = {
  network: {
    enabled: false,
    allowlist: []
  },
  telemetry: {
    enabled: false
  },
  killSwitch: {
    enabled: true
  },
  governance: {
    strictApprovalMode: true
  },
  audit: {
    logPath: "logs/audit.log",
    redactKeys: [
      "password",
      "secret",
      "token",
      "api_key",
      "apikey",
      "authorization"
    ]
  },
  permissions: {
    writeAllowlist: ["workspace", "data"],
    readAllowlist: ["data", "workspace", "docs"]
  }
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "string");
}

function mergeConfig(
  base: JarvisConfig,
  overrides: Partial<JarvisConfig>
): JarvisConfig {
  return {
    network: {
      ...base.network,
      ...overrides.network,
      allowlist: normalizeStringArray(
        overrides.network?.allowlist ?? base.network.allowlist
      )
    },
    telemetry: {
      ...base.telemetry,
      ...overrides.telemetry
    },
    killSwitch: {
      ...base.killSwitch,
      ...overrides.killSwitch
    },
    governance: {
      ...base.governance,
      ...overrides.governance
    },
    audit: {
      ...base.audit,
      ...overrides.audit,
      redactKeys: normalizeStringArray(
        overrides.audit?.redactKeys ?? base.audit.redactKeys
      )
    },
    permissions: {
      ...base.permissions,
      ...overrides.permissions,
      writeAllowlist: normalizeStringArray(
        overrides.permissions?.writeAllowlist ?? base.permissions.writeAllowlist
      ),
      readAllowlist: normalizeStringArray(
        overrides.permissions?.readAllowlist ?? base.permissions.readAllowlist
      )
    }
  };
}

export function loadConfig(configPath?: string): ResolvedConfig {
  const resolvedConfigPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : path.resolve(process.cwd(), "jarvis.config.json");
  let fileConfig: Partial<JarvisConfig> = {};

  if (fs.existsSync(resolvedConfigPath)) {
    const raw = fs.readFileSync(resolvedConfigPath, "utf8");
    try {
      fileConfig = JSON.parse(raw) as Partial<JarvisConfig>;
    } catch (error) {
      throw new Error(
        `Invalid config JSON at ${resolvedConfigPath}: ${String(error)}`
      );
    }
  }

  const merged = mergeConfig(DEFAULT_CONFIG, fileConfig);
  const rootDir = path.dirname(resolvedConfigPath);

  return {
    ...merged,
    audit: {
      ...merged.audit,
      logPath: path.resolve(rootDir, merged.audit.logPath)
    },
    permissions: {
      ...merged.permissions,
      writeAllowlist: merged.permissions.writeAllowlist.map((entry) =>
        path.resolve(rootDir, entry)
      ),
      readAllowlist: merged.permissions.readAllowlist.map((entry) =>
        path.resolve(rootDir, entry)
      )
    },
    configPath: resolvedConfigPath,
    rootDir
  };
}
