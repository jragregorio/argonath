"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@warden/ui";
import { Button } from "@/components/ui/button";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Desktop modal dialog. Hidden below `md` so mobile keeps BottomSheet UIs.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => {
      const closeBtn = panelRef.current?.querySelector<HTMLElement>(
        '[data-modal-close="true"]'
      );
      closeBtn?.focus();
    });

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div className="hidden md:block">
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/60"
        aria-label="Close"
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl",
          className
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-semibold text-lg">
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="mt-0.5 text-sm text-muted-foreground"
              >
                {description}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-modal-close="true"
            onClick={handleClose}
            className={`min-h-11 min-w-11 shrink-0 p-2 ${focusRing}`}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-border bg-background px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
