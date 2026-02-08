import React, { createContext, useContext, useMemo, useState } from "react";
import { Box, Text } from "ink";
import { getReducedMotion, useTheme } from "./theme";

export type ToastKind = "success" | "warning" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  pushToast: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function pickColor(kind: ToastKind, tokens: ReturnType<typeof useTheme>["theme"]) {
  if (kind === "success") {
    return tokens.success;
  }
  if (kind === "warning") {
    return tokens.warning;
  }
  return tokens.danger;
}

export function ToastProvider(props: { children?: React.ReactNode }) {
  const { theme } = useTheme();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (kind: ToastKind, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const entry: Toast = { id, kind, message };
    setToasts((current: Toast[]) => [...current, entry]);
    const lifetime = getReducedMotion() ? 2000 : 3000;
    setTimeout(() => {
      setToasts((current: Toast[]) =>
        current.filter((toast: Toast) => toast.id !== id)
      );
    }, lifetime);
  };

  const value = useMemo(() => ({ pushToast }), []);

  return (
    <ToastContext.Provider value={value}>
      <Box flexDirection="column" marginBottom={1}>
        {toasts.map((toast: Toast) => (
          <Box key={toast.id} marginBottom={1}>
            <Text color={pickColor(toast.kind, theme)}>{toast.message}</Text>
          </Box>
        ))}
      </Box>
      {props.children ?? null}
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("ToastProvider is missing.");
  }
  return value;
}
