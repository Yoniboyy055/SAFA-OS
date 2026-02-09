const fs = require("fs");
const path = require("path");
import { validateConfig } from "./config_validate";

export interface NetworkConfig {
  enabled: boolean;
  allowlist: string[];
  allowlistDomains: string[];
  allowlistUrls: string[];
  timeoutMs: number;
  maxBytes: number;
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
  provider: "smtp" | "gmail" | "sendgrid";
  fromAllowlist: string[];
  toAllowlist: string[];
  domainAllowlist: string[];
  dryRunDefault: boolean;
  from: string;
  smtp: EmailSmtpConfig;
}

export interface StripeConfig {
  enabled: boolean;
  dryRunDefault: boolean;
  apiBase: string;
  mode: "production" | "test";
  statementDescriptor: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CallsConfig {
  enabled: boolean;
  provider: "twilio";
  fromNumberAllowlist: string[];
  toNumberAllowlist: string[];
  countryAllowlist: string[];
  twimlUrl: string;
  recordCalls: boolean;
  dryRunDefault: boolean;
}

export interface ExecutionConfig {
  enabled: boolean;
  allowCommands: string[];
  maxRuntimeMs: number;
  allowlistPaths: string[];
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

export interface PhaseConfig {
  current: number;
}

export interface ReleaseLockConfig {
  enabled: boolean;
  blockedCategories: Array<
    "local" | "network" | "outbound_message" | "external_tool"
  >;
}

export interface PermissionsConfig {
  writeAllowlist: string[];
  readAllowlist: string[];
  stripePriceAllowlist: string[];
  stripeAmountAllowlist: string[];
  stripeCurrencyAllowlist: string[];
  stripeCustomerEmailAllowlist: string[];
  emailSubjectAllowlist: string[];
  emailTemplateAllowlist: string[];
  callIntentAllowlist: string[];
  callTemplateAllowlist: string[];
}

export interface TriggerAction {
  task: string;
  mode: string;
  authority: string;
}

export interface Trigger {
  id: string;
  type: "time" | "event" | "webhook";
  schedule?: string;
  action: TriggerAction;
  requiredPermissions?: string[];
  autoApprove?: boolean;
}

export interface ProactivityTemplate {
  templateId: string;
  allowedSkills: string[];
  maxRisk: "LOW" | "MEDIUM" | "HIGH";
  autoApprove: boolean;
  cryptoSignature?: string;
}

export interface ProactivityConfig {
  enabled: boolean;
  triggers?: Trigger[];
  templates?: ProactivityTemplate[];
}

export interface LLMConfig {
  enabled: boolean;
  provider: "openai" | "anthropic" | "ollama" | "llamacpp";
  model: string;
  fallbackToStatic: boolean;
  maxTokensPerRequest: number;
  costGuardUsd: number;
  temperature?: number;
}

export interface SAFAConfig {
  network: NetworkConfig;
  telemetry: TelemetryConfig;
  killSwitch: KillSwitchConfig;
  governance: GovernanceConfig;
  phase: PhaseConfig;
  releaseLock?: ReleaseLockConfig;
  llm?: LLMConfig;
  email: EmailConfig;
  stripe: StripeConfig;
  calls: CallsConfig;
  execution: ExecutionConfig;
  audit: AuditConfig;
  permissions: PermissionsConfig;
  proactivity?: ProactivityConfig;
}

export interface ResolvedConfig extends SAFAConfig {
  configPath: string;
  rootDir: string;
}

const DEFAULT_CONFIG: SAFAConfig = {
  network: {
    enabled: false,
    allowlist: [],
    allowlistDomains: [],
    allowlistUrls: [],
    timeoutMs: 10000,
    maxBytes: 200000
  },
  telemetry: {
    enabled: false
  },
  killSwitch: {
    enabled: true
  },
  email: {
    enabled: false,
    provider: "smtp",
    fromAllowlist: [],
    toAllowlist: [],
    domainAllowlist: [],
    dryRunDefault: true,
    from: "",
    smtp: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false
    }
  },
  stripe: {
    enabled: false,
    dryRunDefault: true,
    apiBase: "https://api.stripe.com",
    mode: "production",
    statementDescriptor: "SIGNALCRYPT",
    successUrl: "",
    cancelUrl: ""
  },
  calls: {
    enabled: false,
    provider: "twilio",
    fromNumberAllowlist: [],
    toNumberAllowlist: [],
    countryAllowlist: [],
    twimlUrl: "",
    recordCalls: false,
    dryRunDefault: true
  },
  execution: {
    enabled: false,
    allowCommands: [],
    maxRuntimeMs: 600000,
    allowlistPaths: []
  },
  governance: {
    strictApprovalMode: true,
    networkApprovalMode: "per_request",
    maxNetworkPayloadBytes: 16384
  },
  phase: {
    current: 17
  },
  releaseLock: {
    enabled: false,
    blockedCategories: ["network", "outbound_message", "external_tool"]
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
      "bearer",
      "smtpPass",
      "smtpPassword",
      "stripe",
      "twilio",
      "smtp",
      "cookie",
      "set-cookie"
    ]
  },
  permissions: {
    writeAllowlist: ["workspace", "data"],
    readAllowlist: ["data", "workspace", "docs"],
    stripePriceAllowlist: [],
    stripeAmountAllowlist: [],
    stripeCurrencyAllowlist: ["usd"],
    stripeCustomerEmailAllowlist: [],
    emailSubjectAllowlist: [],
    emailTemplateAllowlist: [],
    callIntentAllowlist: ["sales", "support", "follow_up", "payment"],
    callTemplateAllowlist: []
  }
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "string");
}

function mergeConfig(
  base: SAFAConfig,
  overrides: Partial<SAFAConfig>
): SAFAConfig {
  const baseReleaseLock: ReleaseLockConfig =
    base.releaseLock ?? {
      enabled: false,
      blockedCategories: []
    };
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
      ),
      timeoutMs:
        typeof overrides.network?.timeoutMs === "number"
          ? overrides.network.timeoutMs
          : base.network.timeoutMs,
      maxBytes:
        typeof overrides.network?.maxBytes === "number"
          ? overrides.network.maxBytes
          : base.network.maxBytes
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
      fromAllowlist: normalizeStringArray(
        overrides.email?.fromAllowlist ?? base.email.fromAllowlist
      ),
      toAllowlist: normalizeStringArray(
        overrides.email?.toAllowlist ?? base.email.toAllowlist
      ),
      domainAllowlist: normalizeStringArray(
        overrides.email?.domainAllowlist ?? base.email.domainAllowlist
      ),
      smtp: {
        ...base.email.smtp,
        ...overrides.email?.smtp
      }
    },
    stripe: {
      ...base.stripe,
      ...overrides.stripe
    },
    calls: {
      ...base.calls,
      ...overrides.calls,
      fromNumberAllowlist: normalizeStringArray(
        overrides.calls?.fromNumberAllowlist ?? base.calls.fromNumberAllowlist
      ),
      toNumberAllowlist: normalizeStringArray(
        overrides.calls?.toNumberAllowlist ?? base.calls.toNumberAllowlist
      ),
      countryAllowlist: normalizeStringArray(
        overrides.calls?.countryAllowlist ?? base.calls.countryAllowlist
      )
    },
    execution: {
      ...base.execution,
      ...overrides.execution,
      allowCommands: normalizeStringArray(
        overrides.execution?.allowCommands ?? base.execution.allowCommands
      ),
      allowlistPaths: normalizeStringArray(
        overrides.execution?.allowlistPaths ?? base.execution.allowlistPaths
      ),
      maxRuntimeMs:
        typeof overrides.execution?.maxRuntimeMs === "number"
          ? overrides.execution.maxRuntimeMs
          : base.execution.maxRuntimeMs
    },
    governance: {
      ...base.governance,
      ...overrides.governance
    },
    phase: {
      ...base.phase,
      ...overrides.phase,
      current:
        typeof overrides.phase?.current === "number"
          ? overrides.phase.current
          : base.phase.current
    },
    releaseLock: {
      ...baseReleaseLock,
      ...overrides.releaseLock,
      enabled:
        typeof overrides.releaseLock?.enabled === "boolean"
          ? overrides.releaseLock.enabled
          : baseReleaseLock.enabled,
      blockedCategories: normalizeStringArray(
        overrides.releaseLock?.blockedCategories ??
          baseReleaseLock.blockedCategories
      ) as ReleaseLockConfig["blockedCategories"]
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
      stripePriceAllowlist: normalizeStringArray(
        overrides.permissions?.stripePriceAllowlist ??
          base.permissions.stripePriceAllowlist
      ),
      stripeAmountAllowlist: normalizeStringArray(
        overrides.permissions?.stripeAmountAllowlist ??
          base.permissions.stripeAmountAllowlist
      ),
      stripeCurrencyAllowlist: normalizeStringArray(
        overrides.permissions?.stripeCurrencyAllowlist ??
          base.permissions.stripeCurrencyAllowlist
      ),
      stripeCustomerEmailAllowlist: normalizeStringArray(
        overrides.permissions?.stripeCustomerEmailAllowlist ??
          base.permissions.stripeCustomerEmailAllowlist
      ),
      emailSubjectAllowlist: normalizeStringArray(
        overrides.permissions?.emailSubjectAllowlist ??
          base.permissions.emailSubjectAllowlist
      ),
      emailTemplateAllowlist: normalizeStringArray(
        overrides.permissions?.emailTemplateAllowlist ??
          base.permissions.emailTemplateAllowlist
      ),
      callIntentAllowlist: normalizeStringArray(
        overrides.permissions?.callIntentAllowlist ??
          base.permissions.callIntentAllowlist
      ),
      callTemplateAllowlist: normalizeStringArray(
        overrides.permissions?.callTemplateAllowlist ??
          base.permissions.callTemplateAllowlist
      )
    },
    llm: overrides.llm ?? base.llm,
    proactivity: overrides.proactivity
  };
}

export function loadConfig(configPath?: string): ResolvedConfig {
  const resolvedConfigPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : path.resolve(process.cwd(), "safa.config.json");
  let fileConfig: Partial<SAFAConfig> = {};

  if (fs.existsSync(resolvedConfigPath)) {
    const raw = fs.readFileSync(resolvedConfigPath, "utf8");
    try {
      fileConfig = JSON.parse(raw) as Partial<SAFAConfig>;
    } catch (error) {
      throw new Error(
        `Invalid config JSON at ${resolvedConfigPath}: ${String(error)}`
      );
    }
  }

  const merged = mergeConfig(DEFAULT_CONFIG, fileConfig);
  const rootDir = path.dirname(resolvedConfigPath);

  const resolved = {
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
    execution: {
      ...merged.execution,
      allowlistPaths: merged.execution.allowlistPaths.map((entry) =>
        path.resolve(rootDir, entry)
      )
    },
    configPath: resolvedConfigPath,
    rootDir
  };
  validateConfig(resolved);
  return resolved;
}
