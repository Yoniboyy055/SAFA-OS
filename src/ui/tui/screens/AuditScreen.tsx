import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { JarvisApi } from "../adapters/jarvis_api";
import { Section } from "../components/Section";

interface AuditScreenProps {
  api: JarvisApi;
  refreshToken: number;
  active: boolean;
}

export function AuditScreen(props: AuditScreenProps) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      try {
        const next = props.api.tailAudit(12);
        if (mounted) {
          setLines(next);
        }
      } catch {
        if (mounted) {
          setLines(["Unable to read audit log."]);
        }
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [props.api, props.refreshToken]);

  return (
    <Box flexDirection="column">
      <Section title="Audit Log Tail">
        {lines.length === 0 ? (
          <Text>No audit entries found.</Text>
        ) : (
          lines.map((line: string, index: number) => (
            <Text key={`${index}`}>{line}</Text>
          ))
        )}
      </Section>
      <Section title="Notes">
        <Text>Auto-refresh every 3s. Press r to refresh now.</Text>
      </Section>
    </Box>
  );
}
