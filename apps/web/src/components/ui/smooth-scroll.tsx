"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import React, { forwardRef, useEffect } from "react";

/**
 * Sticky stack + Lenis smooth wheel.
 * Globals set overflow-x:hidden on html/body, which disables position:sticky —
 * this demo restores overflow while mounted so panels can stack.
 */
const SmoothScroll = forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  (props, ref) => {
    useEffect(() => {
      const html = document.documentElement;
      const body = document.body;
      const prevHtmlOverflowX = html.style.overflowX;
      const prevBodyOverflowX = body.style.overflowX;
      const prevHtmlOverflowY = html.style.overflowY;
      const prevBodyOverflowY = body.style.overflowY;

      // Must be visible — overflow-x:hidden/clip on ancestors breaks sticky.
      html.style.overflowX = "visible";
      body.style.overflowX = "visible";
      html.style.overflowY = "visible";
      body.style.overflowY = "visible";

      return () => {
        html.style.overflowX = prevHtmlOverflowX;
        body.style.overflowX = prevBodyOverflowX;
        html.style.overflowY = prevHtmlOverflowY;
        body.style.overflowY = prevBodyOverflowY;
      };
    }, []);

    return (
      <>
        <ReactLenis
          root
          options={{
            autoRaf: true,
            lerp: 0.07,
            wheelMultiplier: 0.9,
            touchMultiplier: 1.2,
            smoothWheel: true,
          }}
        />
        <main ref={ref} className="relative" {...props}>
          <article>
            <section className="relative z-0 grid h-screen w-full place-content-center sticky top-0 bg-slate-950 text-white">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
              <h1 className="relative z-10 px-8 text-center text-6xl font-semibold leading-[120%] tracking-tight 2xl:text-7xl">
                I Know What Exactly you&apos;re <br /> Looking For! Scroll Please
                👇
              </h1>
            </section>

            <section className="relative z-10 grid h-screen place-content-center sticky top-0 overflow-hidden rounded-tl-2xl rounded-tr-2xl bg-gray-300 text-black">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
              <h1 className="relative z-10 px-8 text-center text-4xl font-semibold leading-[120%] tracking-tight 2xl:text-7xl">
                here is it
                <br /> enjoy it!
              </h1>
            </section>

            <section className="relative z-20 grid h-screen w-full place-content-center sticky top-0 bg-slate-950 text-white">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
              <h1 className="relative z-10 px-8 text-center text-5xl font-semibold leading-[120%] tracking-tight 2xl:text-7xl">
                Thanks To Scroll.
                <br /> Now Scroll Up Again☝️🏿
              </h1>
            </section>
          </article>
        </main>
      </>
    );
  }
);

SmoothScroll.displayName = "SmoothScroll";

export default SmoothScroll;
