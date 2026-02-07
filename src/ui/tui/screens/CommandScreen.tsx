import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { JarvisApi, type RunResult } from "../adapters/jarvis_api";
import { Section } from "../components/Section";
import { useToasts } from "../toasts";

interface CommandScreenProps {
  api: JarvisApi;
  active: boolean;
  onInputModeChange: (enabled: boolean) => void;
  onAction?: (message: string) => void;
}

function enforceDryRun(line: string): string {
  if (!/^\s*jarvis:/i.test(line)) {
    return line;
  }
  if (/^\s*jarvis:\s*run\b/i.test(line) && !/--dry-run\b/i.test(line)) {
    return `${line.trimEnd()} --dry-run`;
  }
  return line;
}

function formatResult(result: RunResult): string {
  const lines = [...result.logs, ...result.errors];
  if (lines.length === 0) {
    return `Exit code: ${result.exitCode}`;
  }
  return lines.join("\n");
}

export function CommandScreen(props: CommandScreenProps) {
  const [line, setLine] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const { pushToast } = useToasts();

  useEffect(() => {
    props.onInputModeChange(props.active);
    return () => props.onInputModeChange(false);
  }, [props.active, props.onInputModeChange]);

  useInput(async (input, key) => {
    if (!props.active) {
      return;
    }
    if (key.return) {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      setBusy(true);
      const safeLine = enforceDryRun(trimmed);
      const status = props.api.getStatus();
      if (
        !status.networkEnabled &&
        /send_http_request|net:|email:send|payment:request|call:make/i.test(
          safeLine
        )
      ) {
        pushToast("warning", "Network is OFF. Action will be blocked.");
      }
      try {
        const result = await props.api.runLine(safeLine);
        setOutput(formatResult(result));
        props.onAction?.("Command executed.");
        if (result.exitCode === 0) {
          pushToast("success", "Command completed.");
        } else {
          pushToast("warning", "Command returned a non-zero exit code.");
        }
      } catch (error) {
        setOutput(error instanceof Error ? error.message : String(error));
        pushToast("error", "Command failed.");
      } finally {
        setBusy(false);
        setLine("");
      }
      return;
    }
    if (key.backspace || key.delete) {
      setLine((current) => current.slice(0, -1));
      return;
    }
    if (key.ctrl && input === "u") {
      setLine("");
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setLine((current) => current + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Section title="Command Runner (Safe Mode)">
        <Text>Enter a JARVIS line. RUN commands enforce --dry-run.</Text>
        <Text color="yellow">&gt; {line}{busy ? " (running...)" : ""}</Text>
      </Section>
      <Section title="Output">
        <Text>{output || "No output yet."}</Text>
      </Section>
      <Section title="Hints">
        <Text>Example: JARVIS: STATUS</Text>
        <Text>{'Example: JARVIS: RUN read_file {"path":"README.md"}'}</Text>
      </Section>
    </Box>
  );
}
