"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@warden/ui";
import { Button } from "@/components/ui/button";
import { notifyBlockingOverlayClose, notifyBlockingOverlayOpen } from "@/lib/overlay-events";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: "md" | "sm";
  layout?: "divided" | "plain";
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const closeButtonClassName = `h-8 w-8 min-h-8 min-w-8 shrink-0 p-0 ${focusRing}`;

const plainCloseButtonClassName = `absolute right-2.5 top-2.5 h-8 w-8 min-h-8 min-w-8 p-0 ${focusRing}`;

function hasBodyContent(children: ReactNode): boolean {
  if (children == null || children === false) return false;
  if (typeof children === "string") return children.trim().length > 0;
  if (Array.isArray(children)) return children.some(hasBodyContent);
  return true;
}

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
  size = "md",
  layout = "divided",
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const showBody = hasBodyContent(children);
  const isPlain = layout === "plain";

  useEffect(() => {
    if (!open) return;

    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) return;

    notifyBlockingOverlayOpen();

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
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
      const preferred = panelRef.current?.querySelector<HTMLElement>(
        "[data-modal-initial-focus='true'], input:not([disabled]), textarea:not([disabled])"
      );
      const closeBtn = panelRef.current?.querySelector<HTMLElement>(
        '[data-modal-close="true"]'
      );
      (preferred ?? closeBtn)?.focus();
    });

    return () => {
      notifyBlockingOverlayClose();
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="hidden md:block">
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/60"
        aria-label="Close"
        onClick={() => onCloseRef.current()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "fixed left-1/2 top-1/2 z-[60] flex max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl",
          size === "sm"
            ? "w-[min(28rem,calc(100vw-2rem))]"
            : "w-[min(42rem,calc(100vw-2rem))]",
          className
        )}
      >
        {isPlain ? (
          <>
            <div className="relative shrink-0">
              <div className="pl-5 pr-10 pt-4">
                <h2 id={titleId} className="min-w-0 font-semibold text-lg">
                  {title}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-modal-close="true"
                onClick={() => onCloseRef.current()}
                className={plainCloseButtonClassName}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {description && (
              <p
                id={descriptionId}
                className="shrink-0 px-5 pt-2.5 text-sm leading-relaxed text-foreground/85"
              >
                {description}
              </p>
            )}
          </>
        ) : (
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
              onClick={() => onCloseRef.current()}
              className={closeButtonClassName}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {showBody && (
          <div
            className={cn(
              isPlain
                ? "px-5 pt-3 pb-1"
                : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
            )}
          >
            {children}
          </div>
        )}

        {footer && (
          <div
            className={cn(
              "shrink-0 px-5",
              isPlain ? "pt-4 pb-4" : "border-t border-border bg-background py-4"
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
