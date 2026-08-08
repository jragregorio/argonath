"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DASHBOARD_THEME_STORAGE_KEY,
  type DashboardTheme,
} from "@/components/dashboard-theme-constants";

export {
  DASHBOARD_THEME_STORAGE_KEY,
  dashboardThemeFoucScript,
} from "@/components/dashboard-theme-constants";
export type { DashboardTheme } from "@/components/dashboard-theme-constants";

function readStoredTheme(): DashboardTheme {
  if (typeof window === "undefined") return "maiev";
  try {
    const stored = localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
    return stored === "blackberry" ? "blackberry" : "maiev";
  } catch {
    return "maiev";
  }
}

function applyDashboardTheme(theme: DashboardTheme) {
  if (theme === "blackberry") {
    document.documentElement.setAttribute("data-dashboard-theme", "blackberry");
  } else {
    document.documentElement.removeAttribute("data-dashboard-theme");
  }
}

type DashboardThemeContextValue = {
  theme: DashboardTheme;
  setTheme: (theme: DashboardTheme) => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(
  null
);

/** Survives Suspense fallback ↔ resolved shell remount without clearing the html attribute. */
let dashboardThemeProviderMounts = 0;

export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<DashboardTheme>(readStoredTheme);

  useEffect(() => {
    dashboardThemeProviderMounts += 1;
    const stored = readStoredTheme();
    setThemeState(stored);
    applyDashboardTheme(stored);

    return () => {
      dashboardThemeProviderMounts -= 1;
      if (dashboardThemeProviderMounts === 0) {
        document.documentElement.removeAttribute("data-dashboard-theme");
      }
    };
  }, []);

  const setTheme = useCallback((next: DashboardTheme) => {
    setThemeState(next);
    try {
      if (next === "maiev") {
        localStorage.removeItem(DASHBOARD_THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, next);
      }
    } catch {
      /* storage unavailable */
    }
    applyDashboardTheme(next);
  }, []);

  return (
    <DashboardThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) {
    throw new Error("useDashboardTheme must be used within DashboardThemeProvider");
  }
  return ctx;
}
