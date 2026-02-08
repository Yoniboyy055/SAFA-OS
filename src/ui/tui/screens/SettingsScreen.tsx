import React from "react";
import { Box, Text } from "ink";
import { Section } from "../components/Section";
import { useTheme, getReducedMotion } from "../theme";
import type { StatusSnapshot } from "../adapters/jarvis_api";

interface SettingsScreenProps {
  status?: StatusSnapshot;
}

export function SettingsScreen(props: SettingsScreenProps) {
  const { theme } = useTheme();

  return (
    <Box flexDirection="column">
      <Section title="Theme">
        <Text>Active: {theme.name}</Text>
        <Text>Press t to cycle themes.</Text>
      </Section>
      <Section title="Motion">
        <Text>Reduced motion: {getReducedMotion() ? "ON" : "OFF"}</Text>
        <Text>Set JARVIS_REDUCED_MOTION=1 to disable animations.</Text>
      </Section>
      <Section title="Network">
        <Text>Network: {props.status?.networkEnabled ? "ON" : "OFF"}</Text>
        <Text>Kill Switch: {props.status?.killSwitchEnabled ? "ON" : "OFF"}</Text>
      </Section>
    </Box>
  );
}
