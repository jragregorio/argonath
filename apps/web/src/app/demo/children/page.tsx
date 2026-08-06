"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getDeviceDisplayName } from "@warden/shared";
import { cn } from "@warden/ui";
import { useDemo } from "@/lib/demo/demo-provider";

export default function DemoChildrenPage() {
  const router = useRouter();
  const { overview } = useDemo();
  const children = overview.children;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Children"
        description="Manage child profiles and their devices"
      />

      <div className="rounded-lg border border-border/60 bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        Adding or editing children requires a real account. In the demo you can
        still approve extensions, and try nudge or lock from Overview (desktop)
        or each child&apos;s detail page (mobile).
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {children.map((child) => {
          const manageHref = `/demo/children/${child.id}`;

          const navigateToManage = () => {
            router.push(manageHref);
          };

          const handleCardKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigateToManage();
            }
          };

          return (
            <Card
              key={child.id}
              role="link"
              tabIndex={0}
              onClick={navigateToManage}
              onKeyDown={handleCardKeyDown}
              className={cn(
                "cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  <span className="truncate">{child.displayName}</span>
                </CardTitle>
                <CardDescription>
                  {child.devices.length} device(s) paired
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {child.devices.map((device) => (
                    <Badge
                      key={device.id}
                      variant={device.isOnline ? "success" : "secondary"}
                      title={[
                        device.isOnline ? "Online" : "Offline",
                        device.agentVersion
                          ? `Agent v${device.agentVersion}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {getDeviceDisplayName(device)}
                      {device.agentVersion ? ` · v${device.agentVersion}` : ""}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={manageHref}
                    className="text-sm text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Manage profile →
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
