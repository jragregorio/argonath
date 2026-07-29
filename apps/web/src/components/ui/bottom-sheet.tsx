"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@warden/ui";
import { Button } from "@/components/ui/button";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Extra actions in the sticky thumb-zone footer (beside Done). */
  footer?: ReactNode;
  /** Show the sticky Done close button (default true). */
  showDone?: boolean;
  /** Extra class for the sheet panel */
  className?: string;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Mobile bottom sheet. Hidden from `md` and up so desktop keeps inline UIs.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  showDone = true,
  className,
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    const mq = window.matchMedia("(max-width: 767px)");
    if (!mq.matches) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-[60] flex max-h-[min(85dvh,100%)] flex-col rounded-t-2xl border border-border bg-background shadow-xl",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Large tap target — primary mobile dismiss besides Done */}
        <button
          type="button"
          onClick={onClose}
          className="flex w-full shrink-0 flex-col items-center pt-3 pb-2"
          aria-label="Dismiss"
        >
          <span className="h-1.5 w-12 rounded-full bg-muted" />
          <span className="mt-1 text-[11px] text-muted-foreground">
            Tap to close
          </span>
        </button>

        <div className="flex items-start justify-between gap-3 px-4 pb-3">
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex items-center justify-center rounded-lg p-2 min-h-11 min-w-11 hover:bg-secondary shrink-0 ${focusRing}`}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
          {children}
        </div>

        {(showDone || footer) && (
          <div
            className="shrink-0 border-t border-border bg-background px-4 pt-3"
            style={{
              paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex flex-col gap-2">
              {footer}
              {showDone && (
                <Button className="w-full" variant="secondary" onClick={onClose}>
                  Done
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
