import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { SAFAApi, type StatusSnapshot } from "../adapters/safa_api";
import { Section } from "../components/Section";
import { useTheme } from "../theme";

interface HomeScreenProps {
  api: SAFAApi;
  refreshToken: number;
  active: boolean;
}

export function HomeScreen(props: HomeScreenProps) {
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [message, setMessage] = useState<string>("");
  const { theme } = useTheme();

  useEffect(() => {
    try {
      setStatus(props.api.getStatus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [props.api, props.refreshToken]);

  const windowState = status?.networkWindow;
  const windowLine = windowState
    ? `${status?.networkWindowActive ? "ACTIVE" : "INACTIVE"} ${
        windowState.endAt ? `until ${windowState.endAt}` : ""
      }`
    : "UNKNOWN";

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>SAFA OS TUI</Text>
      <Section title="HUD">
        <Text>Network: {status?.networkEnabled ? "ON" : "OFF"}</Text>
        <Text>Kill Switch: {status?.killSwitchEnabled ? "ON" : "OFF"}</Text>
        <Text>Network Window: {windowLine.trim()}</Text>
        <Text>
          Strict Approval: {status?.strictApprovalMode ? "ON" : "OFF"}
        </Text>
        <Text>Pending Approvals: {status?.approvalsPending ?? 0}</Text>
      </Section>
      <Section title="Quick Actions">
        <Text>Use the command palette for actions.</Text>
        <Text>[k] open palette  [r] refresh</Text>
      </Section>
      <Section title="Last Output">
        <Text>{message || "No actions yet."}</Text>
      </Section>
    </Box>
  );
}
