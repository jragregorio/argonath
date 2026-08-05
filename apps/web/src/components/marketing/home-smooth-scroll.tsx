"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@warden/ui";

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

/**
 * Enables Lenis on the marketing homepage (md+ only) and unlocks position:sticky
 * (globals use overflow-x:hidden on html/body, which otherwise breaks sticky).
 */
export function HomeSmoothScroll({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const mdUp = useMdUp();
  const enableLenis = mdUp && !reducedMotion;

  useEffect(() => {
    if (!mdUp) return;

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
  }, [mdUp]);

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

/** Sticky card slot on md+; normal stacked sections on mobile. */
export function StickyHomeCard({
  children,
  zIndex,
  className,
}: {
  children: ReactNode;
  zIndex: number;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "home-sticky-card relative flex w-full flex-col",
        "px-4 py-8 sm:px-6 sm:py-9",
        "md:sticky md:top-[4.25rem] md:min-h-[calc(100dvh-4.25rem)] md:px-8 md:py-6",
        className
      )}
      style={{ zIndex }}
    >
      <div
        className="pointer-events-none absolute inset-0 hidden bg-background md:block"
        aria-hidden="true"
      />
      <div className="relative z-10 flex w-full flex-1 flex-col md:items-center md:justify-center">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
    </section>
  );
}

/** FramedStage sizing inside sticky slots — width comes from StickyHomeCard wrapper. */
export const stickyCardStageClassName =
  "w-full overflow-visible md:overflow-hidden";
