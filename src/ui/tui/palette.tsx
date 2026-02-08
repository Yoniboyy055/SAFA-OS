import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "./theme";

export interface PaletteCommand {
  id: string;
  title: string;
  description: string;
  run: () => Promise<void> | void;
}

interface PaletteProps {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}

function filterCommands(commands: PaletteCommand[], query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return commands;
  }
  return commands.filter((command) => {
    return (
      command.title.toLowerCase().includes(trimmed) ||
      command.description.toLowerCase().includes(trimmed)
    );
  });
}

export function CommandPalette(props: PaletteProps) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const matches = useMemo(
    () => filterCommands(props.commands, query),
    [props.commands, query]
  );

  useEffect(() => {
    if (props.open) {
      setQuery("");
      setSelected(0);
    }
  }, [props.open]);

  useInput(async (input: string, key: any) => {
    if (!props.open) {
      return;
    }
    if (key.escape) {
      props.onClose();
      return;
    }
    if (key.return) {
      const command = matches[selected];
      if (command) {
        await command.run();
      }
      props.onClose();
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((current: string) => current.slice(0, -1));
      setSelected(0);
      return;
    }
    if (key.upArrow) {
      setSelected((current: number) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((current: number) => Math.min(matches.length - 1, current + 1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setQuery((current: string) => current + input);
      setSelected(0);
    }
  });

  if (!props.open) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      padding={1}
      width={60}
    >
      <Text color={theme.accent}>Command Palette</Text>
      <Text color={theme.muted}>Type to search, Enter to run, Esc to close</Text>
      <Box marginTop={1}>
        <Text color={theme.accentSoft}>&gt; {query || ""}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {matches.length === 0 ? (
          <Text color={theme.muted}>No matches.</Text>
        ) : (
          matches.slice(0, 8).map((command, index) => (
            <Text key={command.id} color={index === selected ? theme.accent : theme.foreground}>
              {index === selected ? ">" : " "} {command.title}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}
