import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";

export function Section(props: { title: string; children?: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.accent}>{props.title}</Text>
      <Box marginLeft={2} flexDirection="column">
        {props.children}
      </Box>
    </Box>
  );
}
