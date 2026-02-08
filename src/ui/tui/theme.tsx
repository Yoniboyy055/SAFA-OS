import React, { createContext, useContext, useMemo, useState } from "react";
import { loadThemePreference, saveThemePreference } from "./storage/theme_store";

export type ThemeName = "neon" | "glass" | "dim";

export interface ThemeTokens {
  name: ThemeName;
  background: string;
  foreground: string;
  accent: string;
  accentSoft: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
}

const THEMES: Record<ThemeName, ThemeTokens> = {
  neon: {
    name: "neon",
    background: "black",
    foreground: "white",
    accent: "cyan",
    accentSoft: "magenta",
    muted: "gray",
    border: "cyan",
    success: "green",
    warning: "yellow",
    danger: "red"
  },
  glass: {
    name: "glass",
    background: "black",
    foreground: "white",
    accent: "blue",
    accentSoft: "cyan",
    muted: "gray",
    border: "blue",
    success: "green",
    warning: "yellow",
    danger: "red"
  },
  dim: {
    name: "dim",
    background: "black",
    foreground: "white",
    accent: "gray",
    accentSoft: "white",
    muted: "gray",
    border: "gray",
    success: "green",
    warning: "yellow",
    danger: "red"
  }
};

interface ThemeContextValue {
  theme: ThemeTokens;
  setTheme: (name: ThemeName) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider(props: { children?: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const stored = loadThemePreference();
    return stored && stored in THEMES ? (stored as ThemeName) : "neon";
  });

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
    saveThemePreference(name);
  };

  const cycleTheme = () => {
    const order: ThemeName[] = ["neon", "glass", "dim"];
    const index = order.indexOf(themeName);
    const next = order[(index + 1) % order.length];
    setTheme(next);
  };

  const value = useMemo(() => {
    return {
      theme: THEMES[themeName],
      setTheme,
      cycleTheme
    };
  }, [themeName]);

  return (
    <ThemeContext.Provider value={value}>
      {props.children ?? null}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("ThemeProvider is missing.");
  }
  return value;
}

export function getReducedMotion(): boolean {
  return process.env.SAFA_REDUCED_MOTION === "1";
}
