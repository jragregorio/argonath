"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@warden/ui";

/** Soft cover fade — blur max (px) and floor opacity when fully covered. */
const COVER_BLUR_PX = 8;
const COVER_MIN_OPACITY = 0.78;

/**
 * Next framed panel visibility at which cover/blur begins, as a fraction of
 * *viewport height* (not section/shell/buffer height). 0.05 = 5% of the screen
 * showing the next FramedStage.
 */
const COVER_START_VIEWPORT_RATIO = 0.05;

/** Marks the framed panel content box inside each sticky slot. */
const STICKY_CONTENT_ATTR = "data-home-sticky-content";
/** Marks the FramedStage card itself (excludes shell padding + scroll buffer). */
const FRAMED_STAGE_ATTR = "data-home-framed-stage";

/**
 * Scroll runway between sticky sections (sibling, not inside sticky).
 * Desktop 350px; mobile shorter. Literal class so Tailwind picks it up.
 */
const stickyCardScrollBufferClassName = "h-20 shrink-0 md:h-[350px]";

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

function framedStageOf(slotContent: HTMLElement): HTMLElement {
  return (
    slotContent.querySelector<HTMLElement>(`[${FRAMED_STAGE_ATTR}]`) ??
    slotContent
  );
}

/**
 * Cover progress for the current framed panel.
 *
 * Uses the next *FramedStage* rect only (never the sticky section / shell /
 * scroll buffer). Blur stays 0 until that stage occupies
 * COVER_START_VIEWPORT_RATIO of the viewport from the bottom, then ramps to 1
 * as its top reaches the current stage’s top.
 */
function coverProgress(
  currentStage: DOMRectReadOnly,
  nextStage: DOMRectReadOnly,
  viewportBottom: number
): number {
  const visiblePx = viewportBottom - nextStage.top;
  if (visiblePx <= 0) return 0;

  // 5% of the viewport — ignores buffer/shell inflation of panel height.
  const startVisiblePx = viewportBottom * COVER_START_VIEWPORT_RATIO;
  if (visiblePx < startVisiblePx) return 0;

  if (nextStage.top <= currentStage.top) return 1;

  const startTop = viewportBottom - startVisiblePx;
  const endTop = currentStage.top;
  return Math.min(
    1,
    Math.max(0, (startTop - nextStage.top) / Math.max(startTop - endTop, 1))
  );
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

export type StickyHomeCardTone = "default" | "alt";

/** Sticky card slot on md+; normal stacked sections on mobile. */
export function StickyHomeCard({
  children,
  zIndex,
  className,
  id,
  tone = "default",
  isLast = false,
}: {
  children: ReactNode;
  zIndex: number;
  className?: string;
  id?: string;
  /** Slot page-fill behind the framed stage. default = background; alt = muted. */
  tone?: StickyHomeCardTone;
  /** Final sticky slot — full-viewport fill + centered panel; no scroll runway before footer. */
  isLast?: boolean;
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
      // Buffers are siblings between sticky sections — skip them.
      let next = section.nextElementSibling;
      while (
        next &&
        !(
          next instanceof HTMLElement &&
          next.classList.contains("home-sticky-card")
        )
      ) {
        next = next.nextElementSibling;
      }
      if (!(next instanceof HTMLElement)) {
        if (lastProgressRef.current !== 0) clearCover();
        return;
      }

      const nextContent = next.querySelector<HTMLElement>(
        `[${STICKY_CONTENT_ATTR}]`
      );
      if (!nextContent) {
        if (lastProgressRef.current !== 0) clearCover();
        return;
      }

      // FramedStage only — shell padding + scroll buffer must not affect timing.
      const currentStage = framedStageOf(content);
      const nextStage = framedStageOf(nextContent);

      const progress = coverProgress(
        currentStage.getBoundingClientRect(),
        nextStage.getBoundingClientRect(),
        window.innerHeight
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

  const slotFillClass = tone === "alt" ? "bg-muted" : "bg-background";

  return (
    <>
      {/*
        Sticky section stays ~viewport tall so it pins inside <main> for the
        full stack. Scroll buffers are siblings (not inside sticky) — a taller
        sticky box unsticks early and the covered card rides up with the next.
      */}
      <section
        id={id}
        ref={sectionRef}
        className={cn(
          "home-sticky-card relative flex w-full flex-col",
          "md:sticky md:top-0 md:min-h-dvh",
          "scroll-mt-20 md:scroll-mt-24",
          className
        )}
        style={{ zIndex }}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 hidden md:block",
            slotFillClass
          )}
          aria-hidden="true"
        />
        <div
          className={cn(
            "relative z-10 flex w-full flex-1 flex-col px-4 py-8 sm:px-6 sm:py-9",
            "md:items-center md:justify-center md:px-8 md:py-6",
            /* Clears floating home header (h-12 + md:top-4 when scrolled). */
            "md:pt-[4.75rem]"
          )}
        >
          <div
            ref={contentRef}
            data-home-sticky-content=""
            className={cn(
              "mx-auto w-full max-w-6xl",
              /* Keep the framed panel content-sized; shell fill + justify centers it. */
              isLast && "h-auto shrink-0"
            )}
          >
            {children}
          </div>
        </div>
      </section>
      {/* Colored runway between sticky sections (outside sticky — keeps pin stable). */}
      <div
        className={cn(
          "relative z-0",
          isLast
            ? "h-20 shrink-0 md:hidden"
            : cn(stickyCardScrollBufferClassName, slotFillClass)
        )}
        aria-hidden="true"
      />
    </>
  );
}

/** FramedStage sizing inside sticky slots — width comes from StickyHomeCard wrapper. */
export const stickyCardStageClassName =
  "w-full overflow-visible md:overflow-hidden";
