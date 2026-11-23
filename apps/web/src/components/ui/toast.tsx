"use client";

import { cn } from "@warden/ui";
import { CheckCircle2, X } from "lucide-react";
import type { ToastPlacement, ToastTone } from "@/lib/toast";

type ToastProps = {
  message: string;
  title?: string;
  tone: ToastTone;
  placement?: ToastPlacement;
  /** When set, shows a slim bar that drains over this many ms. */
  countdownMs?: number;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onDismiss: () => void;
};

export function Toast({
  message,
  title,
  tone,
  placement = "bottom",
  countdownMs,
  paused = false,
  onPause,
  onResume,
  onDismiss,
}: ToastProps) {
  const timed = countdownMs !== undefined && countdownMs > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[55] flex justify-center px-4",
        placement === "top"
          ? "top-[calc(0.75rem+env(safe-area-inset-top,0px))] md:top-6"
          : "bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] md:bottom-8"
      )}
    >
      <div
        onPointerEnter={timed ? onPause : undefined}
        onPointerLeave={timed ? onResume : undefined}
        onPointerDown={timed ? onPause : undefined}
        onPointerUp={timed ? onResume : undefined}
        onPointerCancel={timed ? onResume : undefined}
        className={cn(
          "pointer-events-auto relative w-full max-w-md overflow-hidden rounded-lg border shadow-lg backdrop-blur-sm",
          placement === "top" && "toast-drop-in",
          tone === "success"
            ? "border-primary/40 bg-primary/15"
            : tone === "error"
              ? "border-destructive/40 bg-destructive/10"
              : "border-border bg-card/95"
        )}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          {tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? (
              <p className="text-sm font-semibold leading-snug">{title}</p>
            ) : null}
            <p className={cn("text-sm break-words", title && "mt-0.5 text-foreground/90")}>
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {timed ? (
          <div className="h-1 w-full bg-foreground/10" aria-hidden="true">
            <div
              className={cn(
                "toast-countdown h-full origin-left",
                tone === "error" ? "bg-destructive" : "bg-primary"
              )}
              style={{
                animationDuration: `${countdownMs}ms`,
                animationPlayState: paused ? "paused" : "running",
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
