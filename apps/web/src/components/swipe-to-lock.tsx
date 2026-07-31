"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronRight, Lock, Loader2 } from "lucide-react";
import { cn } from "@warden/ui";

type SwipeToLockProps = {
  onConfirm: () => void;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
  title?: string;
  label?: string;
};

/** Matches thumb `h-9 w-9` (2.25rem). */
const THUMB = 36;
const END_PAD = 4;
const COMPLETE_RATIO = 0.88;

export function SwipeToLock({
  onConfirm,
  disabled = false,
  pending = false,
  className,
  title,
  label = "Swipe to lock down",
}: SwipeToLockProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [maxTravel, setMaxTravel] = useState(0);
  const labelId = useId();

  const inactive = disabled || pending;

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setMaxTravel(Math.max(0, el.clientWidth - THUMB - END_PAD * 2));
  }, []);

  useEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    if (inactive) {
      offsetRef.current = 0;
      setOffset(0);
      draggingRef.current = false;
      setDragging(false);
    }
  }, [inactive]);

  const setOffsetSafe = (value: number) => {
    const next = Math.max(0, Math.min(maxTravel, value));
    offsetRef.current = next;
    setOffset(next);
  };

  const finishOrReset = (current: number) => {
    if (inactive || maxTravel <= 0) {
      setOffsetSafe(0);
      return;
    }
    if (current / maxTravel >= COMPLETE_RATIO) {
      setOffsetSafe(maxTravel);
      onConfirm();
      window.setTimeout(() => {
        offsetRef.current = 0;
        setOffset(0);
      }, 180);
      return;
    }
    setOffsetSafe(0);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (inactive || maxTravel <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    startXRef.current = e.clientX;
    startOffsetRef.current = offsetRef.current;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    setOffsetSafe(startOffsetRef.current + delta);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    finishOrReset(offsetRef.current);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (inactive || maxTravel <= 0) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      setOffsetSafe(maxTravel);
      onConfirm();
      window.setTimeout(() => {
        offsetRef.current = 0;
        setOffset(0);
      }, 180);
    } else if (e.key === "Home" || e.key === "ArrowLeft" || e.key === "Escape") {
      e.preventDefault();
      setOffsetSafe(0);
    }
  };

  const progress = maxTravel > 0 ? offset / maxTravel : 0;
  const fillWidth =
    progress >= 0.999
      ? "100%"
      : `${END_PAD + offset + THUMB}px`;

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-11 w-full min-w-0 shrink-0 select-none overflow-hidden rounded-lg border border-destructive/40 bg-destructive/15",
        inactive && "opacity-50",
        className,
      )}
      title={title}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-destructive/25 transition-[width] duration-75"
        style={{ width: fillWidth }}
        aria-hidden="true"
      />

      <div
        id={labelId}
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 px-11 text-xs font-medium whitespace-nowrap text-foreground/80 sm:text-sm"
        style={{ opacity: Math.max(0, 1 - progress * 1.35) }}
        aria-hidden="true"
      >
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
            Locking…
          </>
        ) : (
          <>
            {label}
            <ChevronRight className="h-3.5 w-3.5 opacity-70" />
          </>
        )}
      </div>

      <button
        type="button"
        disabled={inactive}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        role="slider"
        className={cn(
          "absolute top-1 z-10 flex h-9 w-9 items-center justify-center rounded-md bg-destructive text-destructive-foreground shadow-sm touch-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          !inactive && "cursor-grab active:cursor-grabbing",
          !dragging && "transition-[left] duration-150 ease-out",
        )}
        style={{ left: `${END_PAD + offset}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <Lock className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
