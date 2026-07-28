"use client";

import { useEffect, useState } from "react";
import {
  Shield,
  LayoutDashboard,
  Users,
  Camera,
  Clock,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
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

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
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

  return (
    <nav className="flex-1 space-y-1">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href ||
          (href !== "/dashboard" && pathname.startsWith(href));
        const count = badgeFor(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${focusRing} ${
              isActive
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {count > 0 && (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                  isActive
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
            className={`block rounded-lg border border-border bg-secondary px-3 py-2 text-sm hover:bg-secondary/80 ${focusRing}`}
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
                className="w-full appearance-none rounded-lg border border-border bg-secondary px-3 py-2 pr-8 text-sm"
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
          className={`block rounded-lg border border-border bg-secondary px-3 py-2 text-sm hover:bg-secondary/80 ${focusRing}`}
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
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground ${focusRing}`}
      >
        <LogOut className="w-4 h-4" />
        {loggingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2">
      <Shield className="w-7 h-7 text-primary" />
      <span className="text-lg font-bold">Warden</span>
      <span className="text-sm font-medium text-muted-foreground">
        v{APP_VERSION}
      </span>
    </div>
  );
}

export function DashboardNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`inline-flex items-center justify-center rounded-lg p-2 text-foreground hover:bg-secondary ${focusRing}`}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile backdrop */}
      {open && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile slide-over drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] border-r border-border bg-background p-4 flex flex-col transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8">
          <Brand />
        </div>
        <NavLinks onNavigate={() => setOpen(false)} />
        <NavFooter />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border h-dvh sticky top-0 p-4 flex-col overflow-y-auto">
        <div className="mb-8">
          <Brand />
        </div>
        <NavLinks />
        <NavFooter />
      </aside>
    </>
  );
}
