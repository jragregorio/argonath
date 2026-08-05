"use client";

import Link from "next/link";
import { User, Monitor, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import {
  getDeviceDisplayName,
  getPolicyStatusLabel,
} from "@warden/shared";
import { useDemo } from "@/lib/demo/demo-provider";
import { statusBadgeVariant } from "@/lib/demo/overview-helpers";

export default function DemoChildrenPage() {
  const { overview } = useDemo();
  const children = overview.children;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Children"
        description="Browse child profiles and paired devices (read-only in demo)"
      />

      <div className="rounded-lg border border-border/60 bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        Adding or editing children requires a real account. In the demo you can
        still approve extensions, send nudges, and lock devices from Overview.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {children.map((child) => {
          const { evaluation } = child;
          const href = `/demo/children/${child.id}`;

          return (
            <Card key={child.id} className="transition-colors hover:border-primary/40">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate">
                        {child.displayName}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {child.dailyLimitMinutes} min daily limit ·{" "}
                        {evaluation.dailyRemainingMinutes} min left today
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={statusBadgeVariant(evaluation.status)}>
                    {getPolicyStatusLabel(evaluation.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {child.devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {getDeviceDisplayName(device)}
                    </span>
                    <Badge variant={device.isOnline ? "success" : "secondary"}>
                      {device.isOnline ? "Online" : "Offline"}
                    </Badge>
                  </div>
                ))}
                <Link
                  href={href}
                  className="inline-flex items-center text-sm text-primary hover:underline"
                >
                  View details
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
