"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/lib/format-relative-time";
import { trpc } from "@/lib/trpc";
import { cn } from "@warden/ui";
import {
  getDeviceDisplayName,
  isNeverBlockProcessName,
  type RunningApp,
} from "@warden/shared";
import { AppWindow, X } from "lucide-react";

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
  childId: string;
  blockedProcessNames: string[];
  devices: VisibleAppsDevice[];
};

function isProcessBlocked(processName: string, blockedList: string[]): boolean {
  const lower = processName.toLowerCase();
  return blockedList.some((name) => name.toLowerCase() === lower);
}

type RunningAppsListProps = {
  apps: RunningApp[];
  blockedProcessNames: string[];
  onBlock: (processName: string) => void;
  blockBusy: boolean;
};

function RunningAppsList({
  apps,
  blockedProcessNames,
  onBlock,
  blockBusy,
}: RunningAppsListProps) {
  return (
    <ul
      className="max-h-64 divide-y divide-border/50 overflow-y-auto rounded-md border border-border/60 bg-muted/30"
      aria-label="Visible apps on device"
    >
      {apps.map((app, index) => {
        const showProcessName =
          !app.title ||
          app.title.toLowerCase() !== app.processName.toLowerCase();
        const blocked = isProcessBlocked(app.processName, blockedProcessNames);
        const neverBlock = isNeverBlockProcessName(app.processName);
        const canBlock = !blocked && !neverBlock;
        const rowClass = cn(
          "flex w-full items-center gap-2 px-2 py-2 text-left text-sm md:py-1.5 md:text-xs",
          app.isForeground && "bg-primary/10 font-medium",
          canBlock &&
            "cursor-pointer hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11"
        );

        const inner = (
          <>
            <span className="min-w-0 flex-1 truncate">
              {app.title || app.processName}
            </span>
            {app.isForeground && (
              <Badge
                variant="success"
                className="shrink-0 text-[10px] uppercase tracking-wide"
              >
                In use
              </Badge>
            )}
            {neverBlock && (
              <Badge
                variant="secondary"
                className="shrink-0 bg-brand/20 text-brand text-[10px] uppercase tracking-wide"
                title="Warden keeps this process running"
              >
                Protected
              </Badge>
            )}
            {blocked && (
              <Badge
                variant="destructive"
                className="shrink-0 text-[10px] uppercase tracking-wide"
              >
                Blocked
              </Badge>
            )}
            {showProcessName && app.title && (
              <span className="shrink-0 text-muted-foreground">
                {app.processName}
              </span>
            )}
          </>
        );

        return (
          <li key={`${app.processName}-${app.title}-${index}`}>
            {canBlock ? (
              <button
                type="button"
                className={rowClass}
                disabled={blockBusy}
                onClick={() => onBlock(app.processName)}
              >
                {inner}
              </button>
            ) : (
              <div className={rowClass}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BlockedAppsChips({
  blockedProcessNames,
  onUnblock,
  unblockBusy,
}: {
  blockedProcessNames: string[];
  onUnblock: (processName: string) => void;
  unblockBusy: boolean;
}) {
  if (blockedProcessNames.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-sm font-medium text-foreground md:text-xs">
        Blocked apps
      </p>
      <div className="flex flex-wrap gap-2">
        {blockedProcessNames.map((name) => (
          <Badge
            key={name}
            variant="secondary"
            className="h-11 min-h-11 gap-1.5 py-0 pl-3 pr-1 text-sm md:h-9 md:min-h-9 md:pl-2.5 md:text-xs"
          >
            {name}
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/15 disabled:opacity-50 md:h-7 md:w-7"
              aria-label={`Unblock ${name}`}
              disabled={unblockBusy}
              onClick={() => onUnblock(name)}
            >
              <X className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function DeviceVisibleAppsContent({
  device,
  blockedProcessNames,
  onBlock,
  blockBusy,
}: {
  device: VisibleAppsDevice;
  blockedProcessNames: string[];
  onBlock: (processName: string) => void;
  blockBusy: boolean;
}) {
  if (!device.isOnline) {
    return (
      <p className="text-sm text-muted-foreground md:text-xs">Offline</p>
    );
  }

  if (device.runningAppsAt == null) {
    return (
      <p className="text-sm text-muted-foreground md:text-xs">
        Waiting for agent update
      </p>
    );
  }

  if (device.runningApps == null || device.runningApps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground md:text-xs">
        No visible apps
      </p>
    );
  }

  return (
    <RunningAppsList
      apps={device.runningApps}
      blockedProcessNames={blockedProcessNames}
      onBlock={onBlock}
      blockBusy={blockBusy}
    />
  );
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
      className="mt-3 text-right text-sm text-muted-foreground md:text-xs"
      title={formatAbsoluteTime(runningAppsAt)}
    >
      {prefix} {relative} · {clock}
    </p>
  );
}

export function ChildVisibleAppsSection({
  childId,
  blockedProcessNames,
  devices,
}: ChildVisibleAppsSectionProps) {
  const utils = trpc.useUtils();
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);

  const invalidate = () => {
    void utils.children.get.invalidate({ childId });
    void utils.dashboard.activity.invalidate();
  };

  const blockApp = trpc.policy.blockApp.useMutation({
    onSuccess: () => {
      setPendingBlock(null);
      invalidate();
    },
  });

  const unblockApp = trpc.policy.unblockApp.useMutation({
    onSuccess: invalidate,
  });

  const handleUnblock = (processName: string) => {
    unblockApp.mutate({ childId, processName });
  };

  if (devices.length === 0) {
    return null;
  }

  const showDeviceLabels = devices.length > 1;
  const blockBusy = blockApp.isPending;
  const unblockBusy = unblockApp.isPending;

  return (
    <>
      <Card className="w-full pb-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AppWindow className="h-5 w-5 text-muted-foreground" />
            Visible apps
          </CardTitle>
          <CardDescription>
            Tap an app to block it on this child&apos;s PCs
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
              <DeviceVisibleAppsContent
                device={device}
                blockedProcessNames={blockedProcessNames}
                onBlock={setPendingBlock}
                blockBusy={blockBusy}
              />
              {device.runningAppsAt != null && (
                <RunningAppsSnapshotTimestamp
                  runningAppsAt={device.runningAppsAt}
                  isOnline={device.isOnline}
                />
              )}
            </div>
          ))}
          <BlockedAppsChips
            blockedProcessNames={blockedProcessNames}
            onUnblock={handleUnblock}
            unblockBusy={unblockBusy}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingBlock != null}
        onClose={() => setPendingBlock(null)}
        title={
          pendingBlock != null ? `Block ${pendingBlock}?` : "Block app?"
        }
        description={
          pendingBlock != null
            ? `Warden will close ${pendingBlock} when it opens on this child’s PCs.`
            : ""
        }
        confirmLabel="Block"
        variant="destructive"
        busy={blockBusy}
        onConfirm={() => {
          if (pendingBlock != null) {
            blockApp.mutate({ childId, processName: pendingBlock });
          }
        }}
      />
    </>
  );
}
