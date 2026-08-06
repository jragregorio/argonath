"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@warden/ui";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SCALE = 2.5;

type Point = { x: number; y: number };

function distance(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type ZoomableImageProps = {
  src: string;
  alt: string;
  className?: string;
};

export function ZoomableImage({ src, alt, className }: ZoomableImageProps) {
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
  } | null>(null);
  const panRef = useRef<{
    start: Point;
    origin: Point;
  } | null>(null);
  const didPanRef = useRef(false);
  const lastTapRef = useRef(0);

  const reset = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
  }, [src, reset]);

  const setScaleClamped = useCallback((next: number) => {
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
    setScale(clamped);
    if (clamped <= MIN_SCALE) {
      setOffset({ x: 0, y: 0 });
    }
    return clamped;
  }, []);

  const zoomBy = useCallback(
    (delta: number) => {
      setScaleClamped(scale + delta);
    },
    [scale, setScaleClamped]
  );

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -STEP : STEP;
    setScaleClamped(scale + delta);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        startDistance: distance(a, b),
        startScale: scale,
      };
      panRef.current = null;
      return;
    }

    if (scale > MIN_SCALE) {
      didPanRef.current = false;
      panRef.current = {
        start: { x: event.clientX, y: event.clientY },
        origin: offset,
      };
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const ratio = distance(a, b) / pinchRef.current.startDistance;
      setScaleClamped(pinchRef.current.startScale * ratio);
      return;
    }

    if (panRef.current && scale > MIN_SCALE) {
      const dx = event.clientX - panRef.current.start.x;
      const dy = event.clientY - panRef.current.start.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didPanRef.current = true;
      }
      setOffset({
        x: panRef.current.origin.x + dx,
        y: panRef.current.origin.y + dy,
      });
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      panRef.current = null;
    } else if (pointersRef.current.size === 1 && scale > MIN_SCALE) {
      const remaining = [...pointersRef.current.values()][0];
      panRef.current = {
        start: remaining,
        origin: offset,
      };
    }
  };

  const onDoubleActivate = () => {
    if (scale > MIN_SCALE) {
      reset();
    } else {
      setScaleClamped(DOUBLE_TAP_SCALE);
    }
  };

  const onClick = (event: React.MouseEvent) => {
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      event.preventDefault();
      onDoubleActivate();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 min-w-11 bg-black/60 text-white hover:bg-black/80 hover:text-white border-0"
          aria-label="Zoom out"
          disabled={scale <= MIN_SCALE}
          onClick={(e) => {
            e.stopPropagation();
            zoomBy(-STEP);
          }}
        >
          <ZoomOut className="w-5 h-5" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 min-w-11 bg-black/60 text-white hover:bg-black/80 hover:text-white border-0"
          aria-label="Zoom in"
          disabled={scale >= MAX_SCALE}
          onClick={(e) => {
            e.stopPropagation();
            zoomBy(STEP);
          }}
        >
          <ZoomIn className="w-5 h-5" />
        </Button>
      </div>
      <div
        className={cn(
          "overflow-hidden rounded-lg bg-black touch-none select-none",
          scale > MIN_SCALE ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
        )}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed snapshot URLs */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="w-full max-h-[80vh] object-contain pointer-events-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>
      {scale > MIN_SCALE && (
        <p className="mt-2 text-center text-xs text-white/60">
          {Math.round(scale * 100)}% · drag to pan · double-tap to reset
        </p>
      )}
    </div>
  );
}
