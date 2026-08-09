"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Shield,
  LayoutDashboard,
  Users,
  Camera,
  History,
  Settings,
  LogOut,
  ChevronDown,
  MoreHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/dev-config";
import { trpc } from "@/lib/trpc";
import { useDashboardRefresh } from "@/lib/dashboard-refresh";
import { useNavBadges } from "@/lib/family-realtime";
import { APP_VERSION } from "@warden/shared";
import { InteractiveMenu, type InteractiveMenuItem } from "@/components/ui/modern-mobile-menu";
import { notifyBlockingOverlayClose, notifyBlockingOverlayOpen } from "@/lib/overlay-events";

const devAuthBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

const allNavItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/children", label: "Children", icon: Users },
  { href: "/dashboard/activity", label: "Activity", icon: History },
  { href: "/dashboard/snapshots", label: "Snapshots", icon: Camera, requiresSupabase: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const navItems = allNavItems.filter(
  (item) => !item.requiresSupabase || isSupabaseConfigured()
);

const primaryTabs = navItems.filter(
  (item) => item.href !== "/dashboard/settings"
);

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function isNavActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href))
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { badgeFor } = useNavBadges();

  return (
    <nav className="flex-1 space-y-1">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = isNavActive(pathname, href);
        const count = badgeFor(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors min-h-11 ${focusRing} ${
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            {active && (
              <span
                className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-attention"
                aria-hidden="true"
              />
            )}
            <Icon className="w-5 h-5 shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {count > 0 && (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/90 text-primary-foreground"
                }`}
              >
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function NavFooter() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !devAuthBypassEnabled,
    retry: false,
  });
  const [switching, setSwitching] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function switchFamily(familyId: string) {
    if (familyId === meQuery.data?.familyId) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/auth/switch-family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId }),
      });
      if (!res.ok) return;
      // Do not await refetches — clear the switcher spinner while cache resets.
      void utils.invalidate();
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  if (devAuthBypassEnabled) {
    return (
      <div className="pt-4 border-t border-border space-y-3">
        <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
          Dev auth bypass enabled
        </div>
      </div>
    );
  }

  const memberships = meQuery.data?.memberships ?? [];
  const activeFamily =
    memberships.find((m) => m.familyId === meQuery.data?.familyId)?.family
      .name ?? "Family";
  const displayName =
    meQuery.data?.user.name?.trim() ||
    meQuery.data?.user.email ||
    "Account";

  const profileCard = (
    <div className="rounded-lg border border-border bg-secondary px-3 py-3 text-sm">
      <div className="font-medium truncate">{displayName}</div>
      <div className="text-xs text-muted-foreground truncate">{activeFamily}</div>
      <div className="text-xs text-muted-foreground truncate mt-0.5">
        {meQuery.data?.role ?? "…"}
        {meQuery.data?.user.email ? ` · ${meQuery.data.user.email}` : ""}
      </div>
    </div>
  );

  return (
    <div className="pt-4 border-t border-border space-y-3">
      {memberships.length > 1 ? (
        <div className="space-y-2">
          {profileCard}
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground px-1">Family</span>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-lg border border-border bg-secondary px-3 py-3 pr-8 text-sm min-h-11"
                value={meQuery.data?.familyId ?? ""}
                disabled={switching || meQuery.isLoading}
                onChange={(e) => switchFamily(e.target.value)}
              >
                {memberships.map((m) => (
                  <option key={m.familyId} value={m.familyId}>
                    {m.family.name} ({m.role})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </label>
        </div>
      ) : (
        profileCard
      )}

      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-3 py-3 text-sm font-medium text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 min-h-11 ${focusRing}`}
      >
        <LogOut className="w-4 h-4" />
        {loggingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <Shield className="h-7 w-7 text-brand" aria-hidden="true" />
      <div>
        <span className="font-display text-lg font-semibold tracking-tight">
          Warden
        </span>
        <div className="mt-2 h-px w-10 bg-brand/50" aria-hidden="true" />
      </div>
    </div>
  );
}

/**
 * Temporary desktop version until AgentRelease rows are published regularly.
 * Flip USE_AGENT_RELEASE_FOR_DESKTOP_VERSION when ready to read from DB again.
 * Keep HARDCODED_DESKTOP_APP_VERSION in sync with apps/agent/Directory.Build.props.
 */
const USE_AGENT_RELEASE_FOR_DESKTOP_VERSION = false;
const HARDCODED_DESKTOP_APP_VERSION = "0.6.14";

function VersionCredit({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const metaQuery = trpc.agentRelease.latestMeta.useQuery(undefined, {
    enabled: open && USE_AGENT_RELEASE_FOR_DESKTOP_VERSION,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  let desktopVersion: string | null = HARDCODED_DESKTOP_APP_VERSION;
  let desktopStatus: string | null = null;
  if (USE_AGENT_RELEASE_FOR_DESKTOP_VERSION) {
    desktopVersion = metaQuery.data?.version ?? null;
    if (metaQuery.isFetching && !metaQuery.data) {
      desktopStatus = "Loading desktop version…";
    } else if (metaQuery.isError) {
      desktopStatus = "Couldn’t load desktop version.";
    } else if (!desktopVersion) {
      desktopStatus = "No desktop release published.";
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {open && (
        <div
          id={panelId}
          className="absolute bottom-full left-1/2 z-[70] mb-2 w-max max-w-[14rem] -translate-x-1/2 rounded-lg border border-border bg-secondary px-3 py-2 text-left text-[11px] leading-snug shadow-lg"
        >
          <p className="text-muted-foreground">
            Web ·{" "}
            <span className="font-semibold text-foreground">v{APP_VERSION}</span>
          </p>
          <p className="mt-1 text-muted-foreground">
            {desktopVersion ? (
              <>
                Desktop app ·{" "}
                <span className="font-semibold text-foreground">
                  v{desktopVersion}
                </span>
              </>
            ) : (
              desktopStatus
            )}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`mx-auto block w-full rounded-md px-2 py-1.5 text-center text-[11px] text-muted-foreground/70 underline-offset-2 transition-colors hover:text-muted-foreground hover:underline ${focusRing}`}
        aria-expanded={open}
        aria-controls={panelId}
      >
        Made by JRAG · v{APP_VERSION}
      </button>
    </div>
  );
}

function MobileBottomTabs({
  moreOpen,
  onMoreToggle,
}: {
  moreOpen: boolean;
  onMoreToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { refreshDashboard } = useDashboardRefresh();
  const { badgeFor } = useNavBadges();
  const settingsActive = isNavActive(pathname, "/dashboard/settings");

  const menuItems = useMemo((): InteractiveMenuItem[] => {
    const tabs: InteractiveMenuItem[] = primaryTabs.map(({ href, label, icon }) => ({
      label,
      icon,
      href,
      badge: badgeFor(href),
    }));
    tabs.push({ label: "More", icon: MoreHorizontal, onClick: onMoreToggle });
    return tabs;
  }, [badgeFor, onMoreToggle]);

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
      if (index === activeIndex) {
        void refreshDashboard();
        return;
      }
      router.push(item.href);
      return;
    }
    item.onClick?.();
  }

  return (
    <div
      className="md:hidden fixed bottom-0 inset-x-0 z-50 pointer-events-none"
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
        className="md:hidden fixed inset-0 z-[60] bg-black/50"
        aria-label="Close more menu"
        onClick={onClose}
      />
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border border-border bg-background p-4 shadow-xl"
        style={{
          paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="More"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold">More</p>
            <p className="text-xs text-muted-foreground">
              Account &amp; settings
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex items-center justify-center rounded-lg p-2 min-h-11 min-w-11 hover:bg-secondary ${focusRing}`}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className={`flex items-center gap-3 rounded-lg px-3 py-3 min-h-11 text-sm hover:bg-secondary mb-2 ${focusRing}`}
        >
          <Settings className="w-5 h-5 text-primary" />
          <span className="font-medium">Settings</span>
        </Link>

        <NavFooter />

        <VersionCredit className="pt-4" />
      </div>
    </>
  );
}

export function DashboardNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile safe-area — status bar / notch only (no chrome bar) */}
      <div
        className="md:hidden shrink-0"
        style={{ height: "env(safe-area-inset-top, 0px)" }}
        aria-hidden
      />

      <MobileBottomTabs
        moreOpen={moreOpen}
        onMoreToggle={() => setMoreOpen((prev) => !prev)}
      />
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />

      {/* Desktop sidebar */}
      <aside className="relative hidden h-dvh w-64 shrink-0 sticky top-0 flex-col overflow-y-auto border-r border-border bg-background/40 p-4 md:flex">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-primary/5 blur-2xl"
          aria-hidden="true"
        />
        <div className="relative mb-8">
          <Brand />
        </div>
        <NavLinks />
        <NavFooter />
        <VersionCredit className="mt-auto pt-4" />
      </aside>
    </>
  );
}
