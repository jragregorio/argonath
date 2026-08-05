"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@warden/ui";

/** Soft cover fade — blur max (px) and floor opacity when fully covered. */
const COVER_BLUR_PX = 8;
const COVER_MIN_OPACITY = 0.78;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}

function useMdUp() {
  const [mdUp, setMdUp] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setMdUp(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return mdUp;
}

function coverProgress(
  current: DOMRectReadOnly,
  next: DOMRectReadOnly
): number {
  const overlap = current.bottom - next.top;
  if (overlap <= 0) return 0;
  return Math.min(1, overlap / Math.max(current.height, 1));
}

/**
 * Unlocks position:sticky on the marketing homepage (globals use overflow-x:hidden
 * on html/body, which otherwise breaks sticky). Lenis stays md+ only.
 */
export function HomeSmoothScroll({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const mdUp = useMdUp();
  const enableLenis = mdUp && !reducedMotion;

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlX: html.style.overflowX,
      bodyX: body.style.overflowX,
      htmlY: html.style.overflowY,
      bodyY: body.style.overflowY,
    };

    html.style.overflowX = "visible";
    body.style.overflowX = "visible";
    html.style.overflowY = "visible";
    body.style.overflowY = "visible";

    return () => {
      html.style.overflowX = prev.htmlX;
      body.style.overflowX = prev.bodyX;
      html.style.overflowY = prev.htmlY;
      body.style.overflowY = prev.bodyY;
    };
  }, []);

  return (
    <>
      {enableLenis && (
        <ReactLenis
          root
          options={{
            autoRaf: true,
            lerp: 0.08,
            wheelMultiplier: 0.85,
            touchMultiplier: 1.15,
            smoothWheel: true,
            stopInertiaOnNavigate: true,
          }}
        />
      )}
      {children}
    </>
  );
}

/**
 * Scroll runway after each card before the next sticks (~2–3 wheel ticks mobile,
 * a bit more on desktop). In-flow spacer (not margin) so the slot fill color
 * shows in the gap between panels.
 */
const stickyCardScrollBufferClassName = "h-20 shrink-0 md:h-[350px]";

export type StickyHomeCardTone = "default" | "alt";

/** Sticky card slot on md+; normal stacked sections on mobile. */
export function StickyHomeCard({
  children,
  zIndex,
  className,
  id,
  tone = "default",
}: {
  children: ReactNode;
  zIndex: number;
  className?: string;
  id?: string;
  /** Slot page-fill behind the framed stage. default = background; alt = muted. */
  tone?: StickyHomeCardTone;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastProgressRef = useRef(-1);
  const reducedMotion = usePrefersReducedMotion();
  const mdUp = useMdUp();

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    if (!section || !content) return;

    const clearCover = () => {
      lastProgressRef.current = 0;
      content.style.opacity = "";
      content.style.filter = "";
      content.style.willChange = "";
    };

    if (!mdUp) {
      clearCover();
      return;
    }

    let raf = 0;

    const update = () => {
      raf = 0;
      const next = section.nextElementSibling;
      if (
        !(next instanceof HTMLElement) ||
        !next.classList.contains("home-sticky-card")
      ) {
        if (lastProgressRef.current !== 0) clearCover();
        return;
      }

      const progress = coverProgress(
        section.getBoundingClientRect(),
        next.getBoundingClientRect()
      );

      if (Math.abs(progress - lastProgressRef.current) < 0.004) return;
      lastProgressRef.current = progress;

      if (progress <= 0.001) {
        clearCover();
        return;
      }

      const opacity = 1 - progress * (1 - COVER_MIN_OPACITY);
      const blurPx = reducedMotion ? 0 : progress * COVER_BLUR_PX;

      content.style.opacity = opacity.toFixed(3);
      content.style.filter =
        blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : "";
      content.style.willChange = "opacity, filter";
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      clearCover();
    };
  }, [mdUp, reducedMotion]);

  return (
    <section
      id={id}
      ref={sectionRef}
      className={cn(
        "home-sticky-card relative flex w-full flex-col",
        /* Full-viewport sticky slot; fill covers behind the floating header. */
        "md:sticky md:top-0",
        "scroll-mt-20 md:scroll-mt-24",
        className
      )}
      style={{ zIndex }}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 hidden md:block",
          tone === "alt" ? "bg-muted" : "bg-background"
        )}
        aria-hidden="true"
      />
      {/* Viewport shell only — buffer is a sibling so it does not skew centering. */}
      <div
        className={cn(
          "relative z-10 flex w-full flex-col px-4 py-8 sm:px-6 sm:py-9",
          "md:min-h-dvh md:items-center md:justify-center md:px-8 md:py-6",
          /* Clears floating home header (h-12 + md:top-4 when scrolled). */
          "md:pt-[4.75rem]"
        )}
      >
        <div
          ref={contentRef}
          className="mx-auto w-full max-w-6xl"
        >
          {children}
        </div>
      </div>
      {/* Colored runway attached to this slot (visible between framed stages). */}
      <div
        className={cn("relative z-0", stickyCardScrollBufferClassName)}
        aria-hidden="true"
      />
    </section>
  );
}

/** FramedStage sizing inside sticky slots — width comes from StickyHomeCard wrapper. */
export const stickyCardStageClassName =
  "w-full overflow-visible md:overflow-hidden";
