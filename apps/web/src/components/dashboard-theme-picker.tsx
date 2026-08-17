"use client";

import { useDashboardTheme, type DashboardTheme } from "@/components/dashboard-theme";
import { cn } from "@warden/ui";

export const DASHBOARD_THEME_OPTIONS: {
  id: DashboardTheme;
  label: string;
  swatches: string[];
}[] = [
  {
    id: "maiev",
    label: "Maiev",
    swatches: ["#1a2420", "#50c878", "#c5a059", "#2e1a47", "#36454f"],
  },
  {
    id: "blackberry",
    label: "Blackberry",
    swatches: ["#f3eaf1", "#148057", "#6b4060", "#d481ea", "#6173a6"],
  },
];

function ThemeSwatchPreview({ colors }: { colors: string[] }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {colors.map((color) => (
        <span
          key={color}
          className="h-5 w-5 shrink-0 rounded-sm border border-border/50"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function DashboardThemePicker() {
  const { theme: dashboardTheme, setTheme: setDashboardTheme } =
    useDashboardTheme();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {DASHBOARD_THEME_OPTIONS.map(({ id, label, swatches }) => {
        const selected = dashboardTheme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setDashboardTheme(id)}
            className={cn(
              "flex flex-col gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
              selected
                ? "border-primary bg-primary/10"
                : "border-border/70 bg-muted/10 hover:bg-muted/20"
            )}
            aria-pressed={selected}
          >
            <ThemeSwatchPreview colors={swatches} />
            <span className="text-sm font-medium">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
