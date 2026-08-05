"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { cn } from "@warden/ui";
import { useScroll } from "@/components/ui/use-scroll";
import {
  HomeHeaderSignInLink,
  HomeThemeToggle,
} from "@/components/marketing/home-theme";
import {
  homeHeaderActionsClassName,
  homeHeaderCtaClassName,
} from "@/components/marketing/home-header-nav-styles";

/**
 * Marketing homepage header — sticky on all viewports.
 * At top: full-bleed, no border. Scrolled: floating inset pill (mobile + desktop).
 */
export function HomeHeader() {
  const scrolled = useScroll(10);

  return (
    <header
      className={cn(
        "home-fade sticky z-[100] transition-all ease-out",
        scrolled
          ? [
              "top-[max(0.5rem,env(safe-area-inset-top))] mx-3 w-[calc(100%-1.5rem)] max-w-none rounded-xl border border-border",
              "bg-background/95 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-lg",
              "supports-[backdrop-filter]:bg-background/55",
              "md:top-4 md:mx-auto md:w-full md:max-w-4xl",
            ]
          : "top-0 mx-auto w-full max-w-6xl border-0 bg-background/85 backdrop-blur-md"
      )}
    >
      <nav
        className={cn(
          "flex h-14 w-full items-center justify-between px-4 transition-all ease-out md:h-12 md:px-5",
          scrolled && "md:px-2"
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-foreground no-underline"
        >
          <Shield
            className="h-7 w-7 text-attention md:h-6 md:w-6"
            aria-hidden="true"
          />
          <span className="font-display text-lg font-bold tracking-tight md:text-base">
            Warden
          </span>
        </Link>

        <div className={homeHeaderActionsClassName}>
          <HomeThemeToggle />
          <HomeHeaderSignInLink />
          <Link href="/sign-up" className={homeHeaderCtaClassName}>
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
