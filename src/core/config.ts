const fs = require("fs");
const path = require("path");

export interface NetworkConfig {
  enabled: boolean;
  allowlist: string[];
  allowlistDomains: string[];
  allowlistUrls: string[];
}

export interface TelemetryConfig {
  enabled: boolean;
}

export interface KillSwitchConfig {
  enabled: boolean;
}

export interface EmailSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
}

export interface EmailConfig {
  enabled: boolean;
  dryRunDefault: boolean;
  from: string;
  smtp: EmailSmtpConfig;
}

export interface AuditConfig {
  logPath: string;
  redactKeys: string[];
}

export interface GovernanceConfig {
  strictApprovalMode: boolean;
  networkApprovalMode: "per_request" | "plan_hash";
  maxNetworkPayloadBytes: number;
}

export interface PermissionsConfig {
  writeAllowlist: string[];
  readAllowlist: string[];
  emailRecipientAllowlist: string[];
  emailRecipientDenylist: string[];
}

export interface JarvisConfig {
  network: NetworkConfig;
  telemetry: TelemetryConfig;
  killSwitch: KillSwitchConfig;
  governance: GovernanceConfig;
  email: EmailConfig;
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
    allowlist: [],
    allowlistDomains: [],
    allowlistUrls: []
  },
  telemetry: {
    enabled: false
  },
  killSwitch: {
    enabled: true
  },
  email: {
    enabled: false,
    dryRunDefault: true,
    from: "",
    smtp: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false
    }
  },
  governance: {
    strictApprovalMode: true,
    networkApprovalMode: "per_request",
    maxNetworkPayloadBytes: 16384
  },
  audit: {
    logPath: "logs/audit.log",
    redactKeys: [
      "pass",
      "password",
      "secret",
      "token",
      "api_key",
      "apikey",
      "authorization",
      "smtpPass",
      "smtpPassword",
      "cookie",
      "set-cookie"
    ]
  },
  permissions: {
    writeAllowlist: ["workspace", "data"],
    readAllowlist: ["data", "workspace", "docs"],
    emailRecipientAllowlist: [],
    emailRecipientDenylist: ["*@*.ru"]
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
      ),
      allowlistDomains: normalizeStringArray(
        overrides.network?.allowlistDomains ?? base.network.allowlistDomains
      ),
      allowlistUrls: normalizeStringArray(
        overrides.network?.allowlistUrls ?? base.network.allowlistUrls
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
    email: {
      ...base.email,
      ...overrides.email,
      smtp: {
        ...base.email.smtp,
        ...overrides.email?.smtp
      }
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
      ),
      emailRecipientAllowlist: normalizeStringArray(
        overrides.permissions?.emailRecipientAllowlist ??
          base.permissions.emailRecipientAllowlist
      ),
      emailRecipientDenylist: normalizeStringArray(
        overrides.permissions?.emailRecipientDenylist ??
          base.permissions.emailRecipientDenylist
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
