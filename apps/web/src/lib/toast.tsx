"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Toast } from "@/components/ui/toast";
import { BLOCKING_OVERLAY_EVENT, isBlockingOverlayOpen } from "@/lib/overlay-events";

export type ToastTone = "default" | "success" | "error";

export type ToastPlacement = "top" | "bottom";

export type ToastOptions = {
  /** Bold first line above the message. */
  title?: string;
  /** Default `bottom` (existing toasts). */
  placement?: ToastPlacement;
  /** Default 4500ms. */
  durationMs?: number;
  /** Show a slim countdown bar so the user can see the toast is timed. */
  timed?: boolean;
};

type ToastState = {
  id: string;
  message: string;
  tone: ToastTone;
  title?: string;
  placement: ToastPlacement;
  durationMs: number;
  timed: boolean;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);
  /** Time left on the current toast, and when its timer last (re)started. */
  const remainingRef = useRef(0);
  const startedAtRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismissToast = useCallback(() => {
    clearTimer();
    setPaused(false);
    setToast(null);
  }, [clearTimer]);

  const startTimer = useCallback(
    (id: string, ms: number) => {
      clearTimer();
      remainingRef.current = ms;
      startedAtRef.current = Date.now();
      timerRef.current = window.setTimeout(() => {
        setToast((prev) => (prev?.id === id ? null : prev));
        timerRef.current = null;
      }, ms);
    },
    [clearTimer]
  );

  const showToast = useCallback(
    (message: string, tone: ToastTone = "default", options?: ToastOptions) => {
      if (isBlockingOverlayOpen()) return;
      const id = `toast-${Date.now()}`;
      const durationMs = options?.durationMs ?? AUTO_DISMISS_MS;
      setPaused(false);
      setToast({
        id,
        message,
        tone,
        title: options?.title,
        placement: options?.placement ?? "bottom",
        durationMs,
        timed: options?.timed ?? false,
      });
      startTimer(id, durationMs);
    },
    [startTimer]
  );

  /** Hover / touch holds a timed toast so it can be read; release resumes. */
  const pauseToast = useCallback(() => {
    if (!toast?.timed || paused || !timerRef.current) return;
    clearTimer();
    remainingRef.current = Math.max(
      0,
      remainingRef.current - (Date.now() - startedAtRef.current)
    );
    setPaused(true);
  }, [toast, paused, clearTimer]);

  const resumeToast = useCallback(() => {
    if (!toast?.timed || !paused) return;
    setPaused(false);
    startTimer(toast.id, remainingRef.current);
  }, [toast, paused, startTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    const onOverlay = () => dismissToast();
    window.addEventListener(BLOCKING_OVERLAY_EVENT, onOverlay);
    return () => window.removeEventListener(BLOCKING_OVERLAY_EVENT, onOverlay);
  }, [dismissToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          title={toast.title}
          tone={toast.tone}
          placement={toast.placement}
          countdownMs={toast.timed ? toast.durationMs : undefined}
          paused={paused}
          onPause={pauseToast}
          onResume={resumeToast}
          onDismiss={dismissToast}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
