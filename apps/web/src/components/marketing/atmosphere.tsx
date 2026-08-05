import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@warden/ui";

/** Soft fel / gold / violet glows + inset gold window + masked dot grid. */
export function MarketingAtmosphere({
  className,
  insetClassName,
}: {
  className?: string;
  insetClassName?: string;
}) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      {/* No base fill — FramedStage tone (card / secondary) shows through */}
      <div className="absolute -left-16 top-6 h-56 w-56 rounded-full bg-primary/25 blur-[80px] md:top-10 md:h-72 md:w-72 md:blur-[90px]" />
      <div className="absolute -right-10 bottom-0 h-52 w-52 rounded-full bg-attention/20 blur-[80px] md:h-80 md:w-80 md:blur-[100px]" />
      <div className="absolute left-1/3 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-plume/25 blur-[70px] md:h-56 md:w-56 md:blur-[80px]" />
      <div
        className={cn(
          "absolute inset-4 rounded-xl border border-attention/25 md:inset-6",
          insetClassName,
        )}
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(197,160,89,0.18) 1px, transparent 0)",
          backgroundSize: "22px 22px",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
        }}
      />
    </div>
  );
}

export function GoldEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-attention">
        {children}
      </p>
      <div className="mt-3 h-px w-14 bg-attention/50" />
    </div>
  );
}

export type FramedStageTone = "default" | "alt";

/** Floating bordered stage used by auth + marketing sections. */
export function FramedStage({
  children,
  className,
  tone = "default",
  ...props
}: {
  children: ReactNode;
  className?: string;
  /** default = card; alt = secondary (cooler teal-sage / soft mint). */
  tone?: FramedStageTone;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border [box-shadow:var(--home-framed-shadow)]",
        tone === "alt" ? "bg-secondary" : "bg-card",
        className,
      )}
      data-home-framed-stage=""
      {...props}
    >
      {children}
    </div>
  );
}
