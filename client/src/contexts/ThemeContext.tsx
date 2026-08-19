import React, { createContext, useContext, useEffect, useState } from "react";
import { HIGH_READABILITY_STORAGE_KEY, readHighReadabilityPreference } from "./readabilityPreference";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  highReadability: boolean;
  toggleHighReadability?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });
  const [highReadability, setHighReadability] = useState(() => readHighReadabilityPreference(localStorage.getItem(HIGH_READABILITY_STORAGE_KEY)));

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  useEffect(() => {
    document.documentElement.classList.toggle("high-readability", highReadability);
    localStorage.setItem(HIGH_READABILITY_STORAGE_KEY, String(highReadability));
  }, [highReadability]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;
  const toggleHighReadability = () => setHighReadability(current => !current);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, highReadability, toggleHighReadability, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
