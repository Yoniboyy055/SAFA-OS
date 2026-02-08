import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme";

interface KeyHelpProps {
  keys: Array<{ key: string; label: string }>;
}

export function KeyHelp(props: KeyHelpProps) {
  const { theme } = useTheme();
  return (
    <Box flexDirection="row">
      {props.keys.map((entry) => (
        <Box key={entry.key} marginRight={2}>
          <Text color={theme.accent}>[{entry.key}]</Text>
          <Text> {entry.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
