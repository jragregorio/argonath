import { DashboardNav } from "@/components/dashboard-nav";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden md:h-dvh md:min-h-0 md:flex-row md:overflow-hidden">
      <DashboardNav />
      <main className="flex-1 min-w-0 min-h-0 p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] md:overflow-y-auto md:p-8 md:pb-8">
        <div className="max-w-6xl mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
