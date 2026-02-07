import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { getReducedMotion, useTheme } from "./theme";

const STEPS = [
  "Loading core...",
  "Mounting vault...",
  "Governor armed...",
  "Network OFF...",
  "UI ready..."
];

export function BootScreen(props: { onComplete: () => void }) {
  const { theme } = useTheme();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduced = getReducedMotion();
    const totalMs = reduced ? 200 : 1100;
    const stepMs = Math.floor(totalMs / STEPS.length);
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setIndex(Math.min(current, STEPS.length - 1));
      if (current >= STEPS.length - 1) {
        clearInterval(timer);
        setTimeout(props.onComplete, stepMs);
      }
    }, stepMs);
    return () => clearInterval(timer);
  }, [props.onComplete]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text color={theme.accent}>JARVIS OS</Text>
      <Text color={theme.accentSoft}>[BOOT SEQUENCE]</Text>
      <Box marginTop={1} flexDirection="column">
        {STEPS.map((step, stepIndex) => (
          <Text
            key={step}
            color={stepIndex <= index ? theme.accent : theme.muted}
          >
            {stepIndex <= index ? ">" : "-"} {step}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
