"use client";

import { useEffect, useState } from "react";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import {
  Shield,
  LayoutDashboard,
  Users,
  Camera,
  Clock,
  Settings,
  Menu,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/dev-config";

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
  return (
    <div className="pt-4 border-t border-border space-y-3">
      {devAuthBypassEnabled ? (
        <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
          Dev auth bypass enabled
        </div>
      ) : (
        <>
          <OrganizationSwitcher
            afterCreateOrganizationUrl="/dashboard"
            afterLeaveOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
          />
          <UserButton afterSignOutUrl="/" />
        </>
      )}
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
