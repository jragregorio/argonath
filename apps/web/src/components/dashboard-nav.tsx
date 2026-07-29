"use client";

import { useEffect, useState } from "react";
import {
  Shield,
  LayoutDashboard,
  Users,
  Camera,
  Clock,
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
import { useFamilyRealtime } from "@/lib/realtime";
import { APP_VERSION } from "@warden/shared";

const devAuthBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

const allNavItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/children", label: "Children", icon: Users },
  { href: "/dashboard/extensions", label: "Requests", icon: Clock },
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

function useNavBadges() {
  const utils = trpc.useUtils();
  const { data: badges } = trpc.dashboard.navBadges.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const { data: devices } = trpc.device.list.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const deviceIds = devices?.map((d) => d.id) ?? [];

  useFamilyRealtime(deviceIds, (event) => {
    if (
      event.type === "snapshot:ready" ||
      event.type === "snapshot:failed" ||
      event.type.startsWith("extension:")
    ) {
      utils.dashboard.navBadges.invalidate();
    }
  });

  const badgeFor = (href: string): number => {
    if (href === "/dashboard/extensions") return badges?.pendingRequests ?? 0;
    if (href === "/dashboard/snapshots") return badges?.unviewedSnapshots ?? 0;
    return 0;
  };

  return { badgeFor };
}

function isNavActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href))
  );
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/dashboard/children/")) return "Child";
  if (pathname.startsWith("/dashboard/children")) return "Children";
  if (pathname.startsWith("/dashboard/extensions")) return "Requests";
  if (pathname.startsWith("/dashboard/snapshots")) return "Snapshots";
  if (pathname.startsWith("/dashboard/settings")) return "Settings";
  if (pathname === "/dashboard") return "Overview";
  return "Warden";
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
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors min-h-11 ${focusRing} ${
              active
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
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

function NavFooter({ onNavigate }: { onNavigate?: () => void }) {
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
      await utils.invalidate();
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

  return (
    <div className="pt-4 border-t border-border space-y-3">
      {memberships.length > 1 ? (
        <div className="space-y-2">
          <Link
            href="/dashboard/settings"
            onClick={onNavigate}
            className={`block rounded-lg border border-border bg-secondary px-3 py-3 text-sm hover:bg-secondary/80 min-h-11 ${focusRing}`}
          >
            <div className="font-medium truncate">{displayName}</div>
            <div className="text-xs text-muted-foreground truncate">
              Account settings
            </div>
          </Link>
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
        <Link
          href="/dashboard/settings"
          onClick={onNavigate}
          className={`block rounded-lg border border-border bg-secondary px-3 py-3 text-sm hover:bg-secondary/80 min-h-11 ${focusRing}`}
        >
          <div className="font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {activeFamily}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {meQuery.data?.role ?? "…"}
            {meQuery.data?.user.email ? ` · ${meQuery.data.user.email}` : ""}
          </div>
        </Link>
      )}

      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground min-h-11 ${focusRing}`}
      >
        <LogOut className="w-4 h-4" />
        {loggingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "px-2"}`}>
      <Shield className={`${compact ? "w-6 h-6" : "w-7 h-7"} text-primary`} />
      <span className={`${compact ? "text-base" : "text-lg"} font-bold`}>
        Warden
      </span>
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
  const { badgeFor } = useNavBadges();
  const settingsActive = isNavActive(pathname, "/dashboard/settings");

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary"
    >
      <div className="flex items-stretch justify-around px-1 pt-1 pb-1">
        {primaryTabs.map(({ href, label, icon: Icon }) => {
          const active = !moreOpen && isNavActive(pathname, href);
          const count = badgeFor(href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 min-h-14 px-1 py-1.5 text-[11px] font-medium transition-colors ${focusRing} ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMoreToggle}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 min-h-14 px-1 py-1.5 text-[11px] font-medium transition-colors ${focusRing} ${
            moreOpen || settingsActive
              ? "text-primary"
              : "text-muted-foreground"
          }`}
          aria-label="More"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="md:hidden fixed inset-0 z-50 bg-black/50"
        aria-label="Close more menu"
        onClick={onClose}
      />
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-border bg-background p-4 shadow-xl"
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

        <NavFooter onNavigate={onClose} />

        <p className="pt-4 text-center text-[11px] text-muted-foreground/70">
          Made by JRAG · v{APP_VERSION}
        </p>
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
      {/* Mobile top bar — fixed (sticky fails under overflow-x-hidden ancestors) */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 px-4"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
        }}
      >
        <Brand compact />
        <span className="text-sm font-medium text-muted-foreground truncate">
          {pageTitle(pathname)}
        </span>
      </div>
      {/* Reserves space so content starts below the fixed top bar */}
      <div
        className="md:hidden shrink-0"
        style={{
          height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
        }}
        aria-hidden
      />

      <MobileBottomTabs
        moreOpen={moreOpen}
        onMoreToggle={() => setMoreOpen((prev) => !prev)}
      />
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border h-dvh sticky top-0 p-4 flex-col overflow-y-auto">
        <div className="mb-8">
          <Brand />
        </div>
        <NavLinks />
        <NavFooter />
        <p className="mt-auto pt-4 text-center text-[11px] text-muted-foreground/70">
          Made by JRAG · v{APP_VERSION}
        </p>
      </aside>
    </>
  );
}
