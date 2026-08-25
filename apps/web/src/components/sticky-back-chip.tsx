"use client";

import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@warden/ui";

function StickyBackChip({
  targetRef,
  href,
  label,
}: {
  targetRef: RefObject<HTMLElement | null>;
  href: string;
  label: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef]);

  if (!visible) return null;

  return (
    <Link
      href={href}
      className={cn(
        "md:hidden fixed left-5 z-40 flex min-h-11 items-center gap-1.5",
        "rounded-full border border-primary/40 bg-primary/15 px-3.5 py-2",
        "text-base font-medium text-primary shadow-lg backdrop-blur-md",
        "transition-opacity duration-200",
        "hover:bg-primary/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      style={{ top: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

export function InlineBackLink({
  href = "/dashboard/children",
  children = "Back to children",
  chipLabel = "Children",
  className,
}: {
  href?: string;
  children?: ReactNode;
  chipLabel?: string;
  className?: string;
}) {
  const backRef = useRef<HTMLAnchorElement>(null);

  return (
    <>
      <Link
        ref={backRef}
        href={href}
        className={cn(
          "text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
          className
        )}
      >
        <ArrowLeft className="h-4 w-4 max-md:h-5 max-md:w-5 shrink-0" aria-hidden />
        {children}
      </Link>
      <StickyBackChip targetRef={backRef} href={href} label={chipLabel} />
    </>
  );
}
