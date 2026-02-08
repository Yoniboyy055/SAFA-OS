import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { BootScreen } from "./boot";
import { CommandPalette, type PaletteCommand } from "./palette";
import { ThemeProvider, getReducedMotion, useTheme } from "./theme";
import { ToastProvider, useToasts } from "./toasts";
import { SAFAApi, type StatusSnapshot } from "./adapters/safa_api";
import { HomeScreen } from "./screens/HomeScreen";
import { ApprovalsScreen } from "./screens/ApprovalsScreen";
import { AuditScreen } from "./screens/AuditScreen";
import { CommandScreen } from "./screens/CommandScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

export type ScreenId = "home" | "approvals" | "audit" | "command" | "settings";

interface ShellProps {
  configPath?: string;
  actor: string;
  noBoot: boolean;
}

interface NavItem {
  id: ScreenId;
  label: string;
  key: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", key: "1" },
  { id: "approvals", label: "Approvals", key: "2" },
  { id: "audit", label: "Audit", key: "3" },
  { id: "command", label: "Command", key: "4" },
  { id: "settings", label: "Settings", key: "5" }
];

function formatWindow(status?: StatusSnapshot): string {
  if (!status) {
    return "Unknown";
  }
  if (!status.networkWindow.enabled) {
    return "Closed";
  }
  if (!status.networkWindowActive) {
    return "Expired";
  }
  if (!status.networkWindow.endAt) {
    return "Active";
  }
  const end = Date.parse(status.networkWindow.endAt);
  if (Number.isNaN(end)) {
    return "Active";
  }
  const remainingMs = end - Date.now();
  if (remainingMs <= 0) {
    return "Expired";
  }
  const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
  if (minutes >= 120) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h remaining`;
  }
  return `${minutes}m remaining`;
}

function HelpOverlay(props: { open: boolean }) {
  const { theme } = useTheme();
  if (!props.open) {
    return null;
  }
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      padding={1}
      width={60}
      flexDirection="column"
      marginTop={1}
    >
      <Text color={theme.accent}>Help</Text>
      <Text>1-5 Navigate screens</Text>
      <Text>k Open command palette</Text>
      <Text>t Cycle theme</Text>
      <Text>r Refresh status</Text>
      <Text>? Toggle help</Text>
      <Text>q Quit</Text>
    </Box>
  );
}

function ShellLayout(props: { configPath?: string; actor: string }) {
  const { exit } = useApp();
  const { theme, cycleTheme } = useTheme();
  const { pushToast } = useToasts();
  const api = useMemo(
    () => new SAFAApi({ configPath: props.configPath, actor: props.actor }),
    [props.configPath, props.actor]
  );

  const [screen, setScreen] = useState<ScreenId>("home");
  const [refreshToken, setRefreshToken] = useState(0);
  const [status, setStatus] = useState<StatusSnapshot | undefined>(undefined);
  const [lastAction, setLastAction] = useState("Ready.");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inputMode, setInputMode] = useState(false);

  useEffect(() => {
    const update = () => {
      try {
        setStatus(api.getStatus());
      } catch (error) {
        pushToast("error", "Status refresh failed.");
      }
    };
    update();
    const timer = setInterval(update, 800);
    return () => clearInterval(timer);
  }, [api, pushToast]);

  const refresh = () => {
    setRefreshToken((current: number) => current + 1);
    setLastAction("Refreshed status.");
  };

  const paletteCommands: PaletteCommand[] = useMemo(
    () => [
      {
        id: "go-home",
        title: "Go: Home",
        description: "Navigate to Home",
        run: () => setScreen("home")
      },
      {
        id: "go-approvals",
        title: "Go: Approvals",
        description: "Review approvals",
        run: () => setScreen("approvals")
      },
      {
        id: "go-audit",
        title: "Go: Audit",
        description: "Tail audit log",
        run: () => setScreen("audit")
      },
      {
        id: "go-command",
        title: "Go: Command",
        description: "Safe command runner",
        run: () => setScreen("command")
      },
      {
        id: "go-settings",
        title: "Go: Settings",
        description: "Theme and preferences",
        run: () => setScreen("settings")
      },
      {
        id: "action-refresh",
        title: "Action: Refresh",
        description: "Reload status panels",
        run: () => refresh()
      },
      {
        id: "action-theme",
        title: "Action: Toggle theme",
        description: "Cycle TUI theme",
        run: () => {
          cycleTheme();
          pushToast("success", "Theme updated.");
        }
      },
      {
        id: "safe-run-tests",
        title: "Safe: run_tests",
        description: "Run tests (approved)",
        run: async () => {
          const result = await api.runLine("SAFA: RUN run_tests {} --approve");
          setLastAction("run_tests executed.");
          if (result.exitCode === 0) {
            pushToast("success", "run_tests completed.");
          } else {
            pushToast("warning", "run_tests returned non-zero exit code.");
          }
        }
      },
      {
        id: "safe-skills",
        title: "Safe: list skills",
        description: "List registered skills",
        run: async () => {
          const result = await api.runLine("SAFA: SKILLS");
          setLastAction("Skills listed.");
          if (result.exitCode === 0) {
            pushToast("success", "Skills listed.");
          } else {
            pushToast("warning", "Skills command returned non-zero exit code.");
          }
        }
      },
      {
        id: "safe-net-status",
        title: "Safe: net status",
        description: "Read network window status",
        run: async () => {
          const result = await api.runArgs(["net:status"]);
          setLastAction("Network status checked.");
          if (result.exitCode === 0) {
            pushToast("success", "Network status updated.");
          } else {
            pushToast("warning", "Network status returned non-zero exit code.");
          }
        }
      }
    ],
    [api, cycleTheme, pushToast]
  );

  useInput((input: string, key: any) => {
    if (inputMode || paletteOpen || helpOpen) {
      if (helpOpen && input === "?") {
        setHelpOpen(false);
      }
      return;
    }
    if (input.toLowerCase() === "q") {
      exit();
      return;
    }
    if (input === "1") {
      setScreen("home");
      return;
    }
    if (input === "2") {
      setScreen("approvals");
      return;
    }
    if (input === "3") {
      setScreen("audit");
      return;
    }
    if (input === "4") {
      setScreen("command");
      return;
    }
    if (input === "5") {
      setScreen("settings");
      return;
    }
    if (input.toLowerCase() === "r") {
      refresh();
      return;
    }
    if (input.toLowerCase() === "t") {
      cycleTheme();
      pushToast("success", "Theme updated.");
      return;
    }
    if (input.toLowerCase() === "k" || (key.ctrl && input.toLowerCase() === "k")) {
      setPaletteOpen(true);
      return;
    }
    if (input === "?") {
      setHelpOpen(true);
      return;
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="row" flexGrow={1}>
        <Box
          width={22}
          borderStyle="round"
          borderColor={theme.border}
          padding={1}
          flexDirection="column"
        >
          <Text color={theme.accent}>NAV</Text>
          {NAV_ITEMS.map((item) => (
            <Text key={item.id} color={item.id === screen ? theme.accent : theme.foreground}>
              {item.id === screen ? ">" : " "} [{item.key}] {item.label}
            </Text>
          ))}
        </Box>
        <Box flexGrow={1} marginX={1} flexDirection="column">
          {screen === "home" ? (
            <HomeScreen api={api} refreshToken={refreshToken} active />
          ) : null}
          {screen === "approvals" ? (
            <ApprovalsScreen
              api={api}
              refreshToken={refreshToken}
              active
              onAction={setLastAction}
            />
          ) : null}
          {screen === "audit" ? (
            <AuditScreen api={api} refreshToken={refreshToken} active />
          ) : null}
          {screen === "command" ? (
            <CommandScreen
              api={api}
              active
              onInputModeChange={setInputMode}
              onAction={setLastAction}
            />
          ) : null}
          {screen === "settings" ? (
            <SettingsScreen status={status} />
          ) : null}
        </Box>
        <Box
          width={26}
          borderStyle="round"
          borderColor={theme.border}
          padding={1}
          flexDirection="column"
        >
          <Text color={theme.accent}>STATUS</Text>
          <Text>Kill Switch: {status?.killSwitchEnabled ? "ON" : "OFF"}</Text>
          <Text>Network: {status?.networkEnabled ? "ON" : "OFF"}</Text>
          <Text>Window: {formatWindow(status)}</Text>
          <Text>Mode: GOVERNED</Text>
          <Text>Approvals: {status?.approvalsPending ?? 0}</Text>
        </Box>
      </Box>
      <Box
        borderStyle="round"
        borderColor={theme.border}
        padding={1}
        flexDirection="column"
      >
        <Text color={theme.muted}>
          1-5 Navigate | k Palette | t Theme | r Refresh | ? Help | q Quit
        </Text>
        <Text>Last: {lastAction}</Text>
      </Box>
      {paletteOpen ? (
        <Box marginTop={1} justifyContent="center">
          <CommandPalette
            open={paletteOpen}
            commands={paletteCommands}
            onClose={() => setPaletteOpen(false)}
          />
        </Box>
      ) : null}
      {helpOpen ? (
        <Box marginTop={1} justifyContent="center">
          <HelpOverlay open={helpOpen} />
        </Box>
      ) : null}
    </Box>
  );
}

function ShellRoot(props: ShellProps) {
  const [booted, setBooted] = useState(props.noBoot || getReducedMotion());
  if (!booted) {
    return <BootScreen onComplete={() => setBooted(true)} />;
  }
  return <ShellLayout configPath={props.configPath} actor={props.actor} />;
}

export function TuiRoot(props: ShellProps) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ShellRoot
          configPath={props.configPath}
          actor={props.actor}
          noBoot={props.noBoot}
        />
      </ToastProvider>
    </ThemeProvider>
  );
}
