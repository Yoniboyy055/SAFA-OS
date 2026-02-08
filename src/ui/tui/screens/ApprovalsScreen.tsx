import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { JarvisApi } from "../adapters/jarvis_api";
import { Section } from "../components/Section";
import { useToasts } from "../toasts";

interface ApprovalsScreenProps {
  api: JarvisApi;
  refreshToken: number;
  active: boolean;
  onAction?: (message: string) => void;
}

export function ApprovalsScreen(props: ApprovalsScreenProps) {
  const [approvals, setApprovals] = useState(() => props.api.listApprovals());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState<string>("");
  const { pushToast } = useToasts();

  useEffect(() => {
    const list = props.api.listApprovals();
    setApprovals(list);
    setSelectedIndex(0);
  }, [props.api, props.refreshToken]);

  const pending = useMemo(
    () => approvals.filter((entry) => entry.status === "PENDING"),
    [approvals]
  );

  useInput((input: string, key: any) => {
    if (!props.active) {
      return;
    }
    if (key.upArrow) {
      if (pending.length === 0) {
        return;
      }
      setSelectedIndex((current: number) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      if (pending.length === 0) {
        return;
      }
      setSelectedIndex((current: number) =>
        Math.min(pending.length - 1, current + 1)
      );
      return;
    }
    if (input.toLowerCase() === "a") {
      const target = pending[selectedIndex];
      if (!target) {
        setMessage("No pending approval selected.");
        return;
      }
      try {
        props.api.approve(target.id);
        setApprovals(props.api.listApprovals());
        setMessage(`Approved ${target.id}.`);
        props.onAction?.(`Approved ${target.id}.`);
        pushToast("success", `Approved ${target.id}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
        pushToast("error", "Approval failed.");
      }
      return;
    }
    if (input.toLowerCase() === "d") {
      const target = pending[selectedIndex];
      if (!target) {
        setMessage("No pending approval selected.");
        return;
      }
      try {
        props.api.deny(target.id, "Denied via TUI.");
        setApprovals(props.api.listApprovals());
        setMessage(`Denied ${target.id}.`);
        props.onAction?.(`Denied ${target.id}.`);
        pushToast("warning", `Denied ${target.id}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
        pushToast("error", "Denial failed.");
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Section title="Pending Approvals">
        {pending.length === 0 ? (
          <Text>No pending approvals.</Text>
        ) : (
          pending.map((entry: any, index: number) => (
            <Text key={entry.id}>
              {index === selectedIndex ? ">" : " "} {entry.id} {entry.action}
            </Text>
          ))
        )}
      </Section>
      <Section title="Details">
        {pending[selectedIndex] ? (
          <Box flexDirection="column">
            <Text>Target: {pending[selectedIndex].target}</Text>
            <Text>Actor: {pending[selectedIndex].actor}</Text>
            <Text>Created: {pending[selectedIndex].createdAt}</Text>
            {pending[selectedIndex].expiresAt ? (
              <Text>Expires: {pending[selectedIndex].expiresAt}</Text>
            ) : null}
          </Box>
        ) : (
          <Text>Select a pending approval.</Text>
        )}
      </Section>
      <Section title="Actions">
        <Text>[a] approve  [d] deny  [r] refresh</Text>
        <Text>{message}</Text>
      </Section>
    </Box>
  );
}
