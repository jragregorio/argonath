"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@warden/ui";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";

/**
 * Settings cards that collapse to their header on phones (one long page of
 * forms became ~3,000px) and are always open on desktop. Drop-in for
 * Card / CardHeader / CardContent.
 */

type SectionState = {
  open: boolean;
  /** Mobile-only open state; desktop visibility is pure CSS (no flash). */
  openOnMobile: boolean;
  collapsible: boolean;
  toggle: () => void;
  contentId: string;
};

const SectionContext = createContext<SectionState | null>(null);

function useSection(): SectionState {
  const ctx = useContext(SectionContext);
  if (!ctx) throw new Error("SettingsCard parts must be inside <SettingsCard>");
  return ctx;
}

export function SettingsCard({
  children,
  defaultOpen = false,
  className,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const isDesktop = useIsDesktopMd();
  const [openOnMobile, setOpenOnMobile] = useState(defaultOpen);
  const contentId = useId();
  const collapsible = !isDesktop;

  return (
    <SectionContext.Provider
      value={{
        open: !collapsible || openOnMobile,
        openOnMobile,
        collapsible,
        toggle: () => setOpenOnMobile((v) => !v),
        contentId,
      }}
    >
      <Card className={className}>{children}</Card>
    </SectionContext.Provider>
  );
}

export function SettingsCardHeader({ children }: { children: ReactNode }) {
  const { open, collapsible, toggle, contentId } = useSection();

  if (!collapsible) return <CardHeader>{children}</CardHeader>;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <CardHeader
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-controls={contentId}
      onClick={toggle}
      onKeyDown={onKeyDown}
      className={cn(
        "relative cursor-pointer select-none pr-10 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !open && "max-md:mb-0"
      )}
    >
      {children}
      <ChevronDown
        aria-hidden
        className={cn(
          "absolute right-0 top-1 h-5 w-5 text-muted-foreground transition-transform duration-200",
          open && "rotate-180"
        )}
      />
    </CardHeader>
  );
}

export function SettingsCardContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { openOnMobile, contentId } = useSection();
  return (
    <CardContent
      id={contentId}
      className={cn(className, !openOnMobile && "max-md:hidden")}
    >
      {children}
    </CardContent>
  );
}
