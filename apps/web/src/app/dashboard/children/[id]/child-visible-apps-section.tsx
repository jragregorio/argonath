"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/lib/format-relative-time";
import { getDeviceDisplayName, type RunningApp } from "@warden/shared";
import { AppWindow } from "lucide-react";

type VisibleAppsDevice = {
  id: string;
  displayName?: string | null;
  machineName?: string | null;
  isOnline: boolean;
  isPaired: boolean;
  runningApps?: RunningApp[] | null;
  runningAppsAt?: Date | string | null;
};

type ChildVisibleAppsSectionProps = {
  devices: VisibleAppsDevice[];
};

function RunningAppsList({ apps }: { apps: RunningApp[] }) {
  return (
    <ul
      className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-muted/30 px-2 py-1.5"
      aria-label="Visible apps on device"
    >
      {apps.map((app, index) => {
        const showProcessName =
          !app.title ||
          app.title.toLowerCase() !== app.processName.toLowerCase();
        return (
          <li
            key={`${app.processName}-${app.title}-${index}`}
            className={`flex items-start gap-2 rounded px-1 py-0.5 text-sm md:text-xs ${
              app.isForeground ? "bg-primary/10 font-medium" : ""
            }`}
          >
            <span className="min-w-0 flex-1 truncate">
              {app.title || app.processName}
            </span>
            {app.isForeground && (
              <Badge
                variant="secondary"
                className="shrink-0 text-[10px] uppercase tracking-wide"
              >
                In use
              </Badge>
            )}
            {showProcessName && app.title && (
              <span className="shrink-0 text-muted-foreground">
                {app.processName}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DeviceVisibleAppsContent({ device }: { device: VisibleAppsDevice }) {
  if (!device.isOnline) {
    return (
      <p className="text-sm md:text-xs text-muted-foreground">Offline</p>
    );
  }

  if (device.runningAppsAt == null) {
    return (
      <p className="text-sm md:text-xs text-muted-foreground">
        Waiting for agent update
      </p>
    );
  }

  if (device.runningApps == null || device.runningApps.length === 0) {
    return (
      <p className="text-sm md:text-xs text-muted-foreground">
        No visible apps
      </p>
    );
  }

  return <RunningAppsList apps={device.runningApps} />;
}

function formatSnapshotClock(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function RunningAppsSnapshotTimestamp({
  runningAppsAt,
  isOnline,
}: {
  runningAppsAt: Date | string;
  isOnline: boolean;
}) {
  const relative = formatRelativeTime(runningAppsAt);
  const clock = formatSnapshotClock(runningAppsAt);
  const prefix = isOnline ? "Updated" : "Last updated";

  return (
    <p
      className="mt-3 text-right text-sm md:text-xs text-muted-foreground"
      title={formatAbsoluteTime(runningAppsAt)}
    >
      {prefix} {relative} · {clock}
    </p>
  );
}

export function ChildVisibleAppsSection({
  devices,
}: ChildVisibleAppsSectionProps) {
  if (devices.length === 0) {
    return null;
  }

  const showDeviceLabels = devices.length > 1;

  return (
    <Card className="w-full pb-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AppWindow className="h-5 w-5 text-muted-foreground" />
          Visible apps
        </CardTitle>
        <CardDescription>
          Open windows reported by the Windows agent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {devices.map((device) => (
          <div key={device.id}>
            {showDeviceLabels && (
              <p className="mb-2 text-sm font-medium text-foreground">
                {getDeviceDisplayName(device)}
              </p>
            )}
            <DeviceVisibleAppsContent device={device} />
            {device.runningAppsAt != null && (
              <RunningAppsSnapshotTimestamp
                runningAppsAt={device.runningAppsAt}
                isOnline={device.isOnline}
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
