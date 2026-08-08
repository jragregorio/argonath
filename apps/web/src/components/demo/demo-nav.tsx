"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  LayoutDashboard,
  Users,
  History,
  Settings,
  MoreHorizontal,
  X,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { APP_VERSION } from "@warden/shared";
import { InteractiveMenu, type InteractiveMenuItem } from "@/components/ui/modern-mobile-menu";
import { useDemo } from "@/lib/demo/demo-provider";
import { notifyBlockingOverlayClose, notifyBlockingOverlayOpen } from "@/lib/overlay-events";

const demoNavItems = [
  { href: "/demo", label: "Overview", icon: LayoutDashboard },
  { href: "/demo/children", label: "Children", icon: Users },
  { href: "/demo/activity", label: "Activity", icon: History },
  { href: "/demo/settings", label: "Settings", icon: Settings },
];

const primaryTabs = demoNavItems.filter(
  (item) => item.href !== "/demo/settings"
);

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function isNavActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/demo" && pathname.startsWith(href))
  );
}

function badgeFor(href: string, pendingCount: number) {
  if (href === "/demo/activity" && pendingCount > 0) return pendingCount;
  return 0;
}

function NavLinks({
  onNavigate,
  pendingCount,
}: {
  onNavigate?: () => void;
  pendingCount: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1">
      {demoNavItems.map(({ href, label, icon: Icon }) => {
        const active = isNavActive(pathname, href);
        const count = badgeFor(href, pendingCount);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${focusRing} ${
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {active && (
              <span
                className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-attention"
                aria-hidden="true"
              />
            )}
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {count > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function NavFooter({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="rounded-lg border border-border bg-secondary px-3 py-3 text-sm">
        <div className="font-medium">Demo family</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Sample data — approve extensions, or try nudge/lock on Overview
          (desktop) or child detail (mobile)
        </div>
      </div>
      <Link
        href="/sign-up"
        onClick={onNavigate}
        className={`flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-accent ${focusRing}`}
      >
        Create free account
      </Link>
      <Link
        href="/"
        onClick={onNavigate}
        className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-3 py-3 text-sm font-medium text-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive ${focusRing}`}
      >
        <LogOut className="h-4 w-4" />
        Exit demo
      </Link>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <Shield className="h-7 w-7 text-attention" aria-hidden="true" />
      <div>
        <span className="font-display text-lg font-semibold tracking-tight">
          Warden
        </span>
        <div className="mt-2 h-px w-10 bg-attention/50" aria-hidden="true" />
      </div>
    </div>
  );
}

function MobileBottomTabs({
  moreOpen,
  onMoreToggle,
  pendingCount,
}: {
  moreOpen: boolean;
  onMoreToggle: () => void;
  pendingCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const settingsActive = isNavActive(pathname, "/demo/settings");

  const menuItems = useMemo((): InteractiveMenuItem[] => {
    const tabs: InteractiveMenuItem[] = primaryTabs.map(({ href, label, icon }) => ({
      label,
      icon,
      href,
      badge: badgeFor(href, pendingCount),
    }));
    tabs.push({ label: "More", icon: MoreHorizontal, onClick: onMoreToggle });
    return tabs;
  }, [onMoreToggle, pendingCount]);

  const moreIndex = menuItems.length - 1;

  const activeIndex = useMemo(() => {
    if (moreOpen || settingsActive) return moreIndex;
    const routeIndex = primaryTabs.findIndex(({ href }) =>
      isNavActive(pathname, href)
    );
    return routeIndex >= 0 ? routeIndex : 0;
  }, [moreOpen, settingsActive, pathname, moreIndex]);

  function handleItemSelect(index: number) {
    const item = menuItems[index];
    if (!item) return;
    if ("href" in item && item.href) {
      if (index === activeIndex) return;
      router.push(item.href);
      return;
    }
    item.onClick?.();
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="pointer-events-auto px-3 pb-2 pt-1">
        <InteractiveMenu
          items={menuItems}
          activeIndex={activeIndex}
          onItemSelect={handleItemSelect}
          aria-label="Primary"
        />
      </div>
    </div>
  );
}

function MobileMoreSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    notifyBlockingOverlayOpen();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      notifyBlockingOverlayClose();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/50 md:hidden"
        aria-label="Close more menu"
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border border-border bg-background p-4 shadow-xl md:hidden"
        style={{
          paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="More"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-semibold">More</p>
            <p className="text-xs text-muted-foreground">Account &amp; settings</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 hover:bg-secondary ${focusRing}`}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <Link
          href="/demo/settings"
          onClick={onClose}
          className={`mb-2 flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-secondary ${focusRing}`}
        >
          <Settings className="h-5 w-5 text-primary" />
          <span className="font-medium">Settings</span>
        </Link>

        <NavFooter onNavigate={onClose} />

        <p className="pt-4 text-center text-[11px] text-muted-foreground/70">
          Demo · v{APP_VERSION}
        </p>
      </div>
    </>
  );
}

export function DemoNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { pendingRequestCount } = useDemo();

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      <div
        className="shrink-0 md:hidden"
        style={{ height: "env(safe-area-inset-top, 0px)" }}
        aria-hidden
      />

      <MobileBottomTabs
        moreOpen={moreOpen}
        onMoreToggle={() => setMoreOpen((prev) => !prev)}
        pendingCount={pendingRequestCount}
      />
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />

      <aside className="relative sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-background/40 p-4 md:flex">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-primary/5 blur-2xl"
          aria-hidden="true"
        />
        <div className="relative mb-8">
          <Brand />
        </div>
        <NavLinks pendingCount={pendingRequestCount} />
        <NavFooter />
        <p className="mt-auto pt-4 text-center text-[11px] text-muted-foreground/70">
          Demo · v{APP_VERSION}
        </p>
      </aside>
    </>
  );
}
