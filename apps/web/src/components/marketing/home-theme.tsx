"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@warden/ui";
import { HOME_THEME_STORAGE_KEY, type HomeTheme } from "@/components/marketing/home-theme-constants";
import {
  homeHeaderNavToggleClassName,
  homeHeaderSignInClassName,
} from "@/components/marketing/home-header-nav-styles";

export { HOME_THEME_STORAGE_KEY } from "@/components/marketing/home-theme-constants";
export type { HomeTheme } from "@/components/marketing/home-theme-constants";
export {
  homeHeaderNavInteractiveClassName,
  homeHeaderNavToggleClassName,
  homeHeaderSignInClassName,
  homeHeaderCtaClassName,
  homeHeaderActionsClassName,
} from "@/components/marketing/home-header-nav-styles";
function readStoredTheme(): HomeTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return localStorage.getItem(HOME_THEME_STORAGE_KEY) === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

function applyHomeTheme(theme: HomeTheme) {
  document.documentElement.classList.toggle("home-theme-light", theme === "light");
}

type HomeThemeContextValue = {
  theme: HomeTheme;
  toggleTheme: () => void;
};

const HomeThemeContext = createContext<HomeThemeContextValue | null>(null);

export function HomeThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<HomeTheme>(readStoredTheme);

  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored);
    applyHomeTheme(stored);

    return () => {
      document.documentElement.classList.remove("home-theme-light");
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: HomeTheme = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(HOME_THEME_STORAGE_KEY, next);
      } catch {
        /* storage unavailable */
      }
      applyHomeTheme(next);
      return next;
    });
  }, []);

  return (
    <HomeThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </HomeThemeContext.Provider>
  );
}

function useHomeTheme() {
  const ctx = useContext(HomeThemeContext);
  if (!ctx) {
    throw new Error("useHomeTheme must be used within HomeThemeProvider");
  }
  return ctx;
}

/** Shared hover/focus pad for homepage header controls (theme toggle, Sign in). */
export function HomeHeaderSignInLink({ className }: { className?: string }) {
  return (
    <Link href="/sign-in" className={cn(homeHeaderSignInClassName, className)}>
      Sign in
    </Link>
  );
}

export function HomeThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useHomeTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(homeHeaderNavToggleClassName, className)}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      aria-pressed={isLight}
      suppressHydrationWarning
    >
      {isLight ? (
        <Moon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
      ) : (
        <Sun className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
      )}
    </button>
  );
}

/** Keeps marketing device previews on the dark Maiev palette when the page is light. */
export function MockDeviceChrome({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mock-device-chrome", className)}>{children}</div>
  );
}
