"use client";

import { cn } from "@warden/ui";
import { CheckCircle2, X } from "lucide-react";
import type { ToastTone } from "@/lib/toast";

type ToastProps = {
  message: string;
  tone: ToastTone;
  onDismiss: () => void;
};

export function Toast({ message, tone, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[80] flex justify-center px-4 md:bottom-8"
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm",
          tone === "success"
            ? "border-primary/40 bg-primary/15"
            : tone === "error"
              ? "border-destructive/40 bg-destructive/10"
              : "border-border bg-card/95"
        )}
      >
        {tone === "success" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        ) : null}
        <p className="flex-1 text-sm">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
