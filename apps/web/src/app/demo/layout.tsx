import type { Metadata } from "next";
import { DemoProvider } from "@/lib/demo/demo-provider";
import { DemoShell } from "@/components/demo/demo-shell";
import { dashboardThemeFoucScript } from "@/components/dashboard-theme-constants";
import { DashboardThemeProvider } from "@/components/dashboard-theme";

export const metadata: Metadata = {
  title: "Demo dashboard — Warden",
  description: "Try the Warden parent dashboard with sample data.",
  robots: { index: false, follow: false },
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: dashboardThemeFoucScript }} />
      <DashboardThemeProvider>
        <DemoProvider>
          <DemoShell>{children}</DemoShell>
        </DemoProvider>
      </DashboardThemeProvider>
    </>
  );
}
