"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@warden/ui";
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";
import { useDemo } from "@/lib/demo/demo-provider";

const EXIT_TIP_SEEN_KEY = "warden-demo-exit-tip-seen";

export function DemoExitTip() {
  const isDesktop = useIsDesktopMd();
  const { signupPromptOpen } = useDemo();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(EXIT_TIP_SEEN_KEY) === "1") return;

    // Wait for layout / bottom nav; desktop sees Exit in the sidebar already.
    const showId = window.setTimeout(() => {
      if (window.matchMedia("(min-width: 768px)").matches) {
        sessionStorage.setItem(EXIT_TIP_SEEN_KEY, "1");
        return;
      }
      setVisible(true);
    }, 900);

    return () => window.clearTimeout(showId);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const hideId = window.setTimeout(() => {
      sessionStorage.setItem(EXIT_TIP_SEEN_KEY, "1");
      setVisible(false);
    }, 6000);
    return () => window.clearTimeout(hideId);
  }, [visible]);

  // Hide if they resize to desktop while tip is up
  useEffect(() => {
    if (isDesktop && visible) {
      setVisible(false);
      sessionStorage.setItem(EXIT_TIP_SEEN_KEY, "1");
    }
  }, [isDesktop, visible]);

  function dismiss() {
    sessionStorage.setItem(EXIT_TIP_SEEN_KEY, "1");
    setVisible(false);
  }

  if (!visible || signupPromptOpen) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[55] flex justify-end px-4 md:hidden"
    >
      <div
        className={cn(
          "pointer-events-auto relative mr-1 max-w-[16.5rem] rounded-lg border border-attention/40 bg-card/95 px-3 py-2.5 shadow-lg backdrop-blur-sm"
        )}
      >
        <div className="flex items-start gap-2">
          <MoreHorizontal
            className="mt-0.5 h-4 w-4 shrink-0 text-attention"
            aria-hidden
          />
          <p className="flex-1 text-sm leading-snug text-foreground">
            Tap <span className="font-medium">More</span> to exit the demo
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss tip"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Caret pointing toward the More tab */}
        <span
          className="absolute -bottom-1.5 right-7 h-3 w-3 rotate-45 border-b border-r border-attention/40 bg-card/95"
          aria-hidden
        />
      </div>
    </div>
  );
}
