import Link from "next/link";
import type { ReactNode } from "react";
import { Shield } from "lucide-react";
import {
  GoldEyebrow,
  MarketingAtmosphere,
  FramedStage,
} from "@/components/marketing/atmosphere";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-6 sm:px-6 sm:py-8 md:px-8">
      <FramedStage className="grid w-full max-w-5xl md:min-h-[40rem] md:grid-cols-2">
        {/* Mobile hero band */}
        <aside className="relative flex min-h-[11.5rem] flex-col justify-between overflow-hidden p-6 sm:min-h-[13rem] sm:p-8 md:hidden">
          <MarketingAtmosphere />
          <GoldEyebrow className="relative z-10">Warden</GoldEyebrow>
          <div className="relative z-10 max-w-xs">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
              Protect what matters most
            </h2>
          </div>
        </aside>

        {/* Desktop left panel */}
        <aside
          className="relative hidden flex-col justify-between overflow-hidden p-10 md:flex"
          aria-hidden="true"
        >
          <MarketingAtmosphere />
          <GoldEyebrow className="relative z-10">Warden</GoldEyebrow>
          <div className="relative z-10 max-w-sm space-y-4">
            <h2 className="font-display text-4xl font-semibold tracking-tight text-balance text-foreground lg:text-5xl">
              Protect what matters most
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground text-pretty">
              Set daily limits, approve extension requests, and enforce screen
              time on your child&apos;s Windows PC — from one parent dashboard.
            </p>
          </div>
        </aside>

        <div className="relative flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-12">
          <div className="mx-auto w-full max-w-sm space-y-7 sm:space-y-8">
            <div className="space-y-5 text-left sm:space-y-6">
              <Link href="/" className="inline-flex items-center gap-2">
                <Shield
                  className="h-7 w-7 text-attention"
                  aria-hidden="true"
                />
                <span className="font-display text-lg font-semibold tracking-tight">
                  Warden
                </span>
              </Link>
              <div className="space-y-2">
                <h1 className="font-display text-3xl font-semibold tracking-tight">
                  {title}
                </h1>
                <p className="text-sm text-muted-foreground text-pretty">
                  {subtitle}
                </p>
              </div>
            </div>

            {children}

            <div className="text-center text-sm text-muted-foreground">
              {footer}
            </div>
          </div>
        </div>
      </FramedStage>
    </div>
  );
}
