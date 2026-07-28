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

  return (
    <nav className="flex-1 space-y-1">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href ||
          (href !== "/dashboard" && pathname.startsWith(href));
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
            <Icon className="w-5 h-5" />
            {label}
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

  return (
    <div className="pt-4 border-t border-border space-y-3">
      {memberships.length > 1 ? (
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
      ) : (
        <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
          <div className="font-medium truncate">{activeFamily}</div>
          <div className="text-xs text-muted-foreground">
            {meQuery.data?.role ?? "…"}
            {meQuery.data?.user.email ? ` · ${meQuery.data.user.email}` : ""}
          </div>
        </div>
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
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border min-h-screen p-4 flex-col">
        <div className="mb-8">
          <Brand />
        </div>
        <NavLinks />
        <NavFooter />
      </aside>
    </>
  );
}
