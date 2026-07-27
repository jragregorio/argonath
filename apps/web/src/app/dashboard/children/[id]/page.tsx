"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useFamilyRealtime } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { AllowedWindow } from "@argonath/shared";
import { getDeviceDisplayName, getPolicyStatusLabel } from "@argonath/shared";
import {
  ArrowLeft,
  Camera,
  Copy,
  Lock,
  Monitor,
  Pencil,
  RefreshCw,
  Trash2,
  Unlock,
  Video,
} from "lucide-react";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/dev-config";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

export default function ChildDetailPage() {
  const params = useParams();
  const router = useRouter();
  const childId = params.id as string;
  const utils = trpc.useUtils();

  const { data: child, isLoading } = trpc.children.get.useQuery(
    { childId },
    { refetchInterval: 5000 }
  );
  const { data: evaluation } = trpc.policy.getEvaluation.useQuery(
    { childId },
    { refetchInterval: 10_000 }
  );
  const updatePolicy = trpc.policy.update.useMutation({
    onSuccess: () => {
      utils.policy.getEvaluation.invalidate({ childId });
      utils.children.get.invalidate({ childId });
    },
  });
  const renameChild = trpc.children.rename.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.children.list.invalidate();
      utils.device.list.invalidate();
      setEditingChildName(false);
    },
  });
  const deleteChild = trpc.children.delete.useMutation({
    onSuccess: () => {
      utils.children.list.invalidate();
      utils.device.list.invalidate();
      router.push("/dashboard/children");
    },
  });
  const generateCode = trpc.device.generatePairingCode.useMutation();
  const renameDevice = trpc.device.rename.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.device.list.invalidate();
      setEditingDeviceId(null);
    },
  });
  const deleteDevice = trpc.device.delete.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.device.list.invalidate();
    },
  });
  const setAdminLock = trpc.device.setAdminLock.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.device.list.invalidate();
    },
  });
  const requestCapture = trpc.snapshot.requestCapture.useMutation({
    onSuccess: () => utils.snapshot.list.invalidate(),
  });

  const [pairingCode, setPairingCode] = useState<{
    code: string;
    expiresAt: Date;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingChildName, setEditingChildName] = useState(false);
  const [childNameDraft, setChildNameDraft] = useState("");
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceNameDraft, setDeviceNameDraft] = useState("");

  const policy = child?.policies[0];
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [allowedWindows, setAllowedWindows] = useState<AllowedWindow[] | null>(
    null
  );
  const [isActive, setIsActive] = useState<boolean | null>(null);

  const currentLimit = dailyLimit ?? policy?.dailyLimitMinutes ?? 120;
  const currentWindows =
    allowedWindows ?? (policy?.allowedWindows as AllowedWindow[]) ?? [];
  const currentActive = isActive ?? policy?.isActive ?? true;

  const deviceIds = child?.devices.map((d) => d.id) ?? [];
  useFamilyRealtime(deviceIds, () => {
    utils.children.get.invalidate({ childId });
    utils.policy.getEvaluation.invalidate({ childId });
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-5 w-64 max-w-full" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56 max-w-full mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-9 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!child) {
    return <div>Child not found</div>;
  }

  const handleSavePolicy = () => {
    updatePolicy.mutate({
      childId,
      dailyLimitMinutes: currentLimit,
      allowedWindows: currentWindows,
      isActive: currentActive,
    });
  };

  const addWindow = () => {
    setAllowedWindows([
      ...currentWindows,
      { day: 1, start: "15:00", end: "20:00" },
    ]);
  };

  const updateWindow = (index: number, field: keyof AllowedWindow, value: string | number) => {
    const updated = [...currentWindows];
    updated[index] = { ...updated[index], [field]: value };
    setAllowedWindows(updated);
  };

  const removeWindow = (index: number) => {
    setAllowedWindows(currentWindows.filter((_, i) => i !== index));
  };

  const startRenameChild = () => {
    setChildNameDraft(child.displayName);
    setEditingChildName(true);
  };

  const saveChildName = () => {
    const next = childNameDraft.trim();
    if (!next || next === child.displayName) {
      setEditingChildName(false);
      return;
    }
    renameChild.mutate({ childId, displayName: next });
  };

  const confirmDeleteChild = () => {
    const deviceCount = child.devices.length;
    const ok = window.confirm(
      `Delete ${child.displayName} and ${deviceCount} connected device${deviceCount === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (ok) deleteChild.mutate({ childId });
  };

  const startRenameDevice = (device: {
    id: string;
    displayName?: string | null;
    machineName?: string | null;
  }) => {
    setEditingDeviceId(device.id);
    setDeviceNameDraft(getDeviceDisplayName(device));
  };

  const saveDeviceName = (deviceId: string) => {
    const next = deviceNameDraft.trim();
    if (!next) {
      setEditingDeviceId(null);
      return;
    }
    renameDevice.mutate({ deviceId, displayName: next });
  };

  const confirmDeleteDevice = (device: {
    id: string;
    displayName?: string | null;
    machineName?: string | null;
  }) => {
    const label = getDeviceDisplayName(device);
    const ok = window.confirm(
      `Remove device "${label}"? The agent will need to be paired again to reconnect.`
    );
    if (ok) deleteDevice.mutate({ deviceId: device.id });
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/children"
          className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to children
        </Link>

        {editingChildName ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveChildName();
              }}
            >
              <Input
                value={childNameDraft}
                onChange={(e) => setChildNameDraft(e.target.value)}
                className="max-w-xs text-lg font-semibold h-11"
                autoFocus
                maxLength={50}
              />
              <Button type="submit" size="sm" disabled={renameChild.isPending}>
                {renameChild.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingChildName(false)}
              >
                Cancel
              </Button>
            </form>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDeleteChild}
              disabled={deleteChild.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteChild.isPending ? "Deleting..." : "Delete child"}
            </Button>
          </div>
        ) : (
          <PageHeader
            title={child.displayName}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startRenameChild}
                  title="Rename child"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={confirmDeleteChild}
                  disabled={deleteChild.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleteChild.isPending ? "Deleting..." : "Delete child"}
                </Button>
              </div>
            }
          />
        )}

        {evaluation && (
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <Badge
              variant={
                evaluation.status === "allowed" ? "success" : "warning"
              }
            >
              {getPolicyStatusLabel(evaluation.status)}
            </Badge>
            <span className="text-muted-foreground text-sm">
              {evaluation.usedMinutes} /{" "}
              {evaluation.dailyLimitMinutes + evaluation.bonusMinutes} min used
              today
              {evaluation.bonusMinutes > 0 &&
                ` (+${evaluation.bonusMinutes} bonus)`}
            </span>
            <span className="text-xs text-muted-foreground">
              Refreshes every 10s from agent heartbeats
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Screen time policy</CardTitle>
            <CardDescription>
              Set daily limits and allowed time windows
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="active"
                checked={currentActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="active">Policy active</Label>
            </div>

            <div>
              <Label htmlFor="limit">Daily limit (minutes)</Label>
              <Input
                id="limit"
                type="number"
                min={0}
                max={1440}
                value={currentLimit}
                onChange={(e) => setDailyLimit(parseInt(e.target.value) || 0)}
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Allowed windows</Label>
                <Button variant="outline" size="sm" onClick={addWindow}>
                  Add window
                </Button>
              </div>
              {currentWindows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No windows set — allowed any time (within daily limit)
                </p>
              ) : (
                <div className="space-y-2">
                  {currentWindows.map((window, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        value={window.day}
                        onChange={(e) =>
                          updateWindow(i, "day", parseInt(e.target.value))
                        }
                        className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
                      >
                        {DAYS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="time"
                        value={window.start}
                        onChange={(e) => updateWindow(i, "start", e.target.value)}
                        className="w-32"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={window.end}
                        onChange={(e) => updateWindow(i, "end", e.target.value)}
                        className="w-32"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeWindow(i)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleSavePolicy} disabled={updatePolicy.isPending}>
              {updatePolicy.isPending ? "Saving..." : "Save policy"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>
              Pair the Windows agent using a one-time code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {child.devices.map((device) => (
              <div
                key={device.id}
                className="flex flex-col gap-3 p-3 rounded-lg border border-border"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Monitor className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      {editingDeviceId === device.id ? (
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveDeviceName(device.id);
                          }}
                        >
                          <Input
                            value={deviceNameDraft}
                            onChange={(e) => setDeviceNameDraft(e.target.value)}
                            className="h-9 max-w-[12rem]"
                            autoFocus
                            maxLength={50}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            disabled={renameDevice.isPending}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingDeviceId(null)}
                          >
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium truncate">
                            {getDeviceDisplayName(device)}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => startRenameDevice(device)}
                            title="Rename device"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {device.machineName &&
                        device.displayName &&
                        device.machineName !== device.displayName
                          ? `${device.machineName} · `
                          : ""}
                        v{device.agentVersion ?? "?"} ·{" "}
                        {device.lastSeenAt
                          ? `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`
                          : "Never connected"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={device.isOnline ? "success" : "secondary"}>
                      {device.isOnline ? "Online" : "Offline"}
                    </Badge>
                    {device.adminLock && (
                      <Badge variant="destructive">Locked down</Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {device.adminLock ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAdminLock.mutate({
                          deviceId: device.id,
                          locked: false,
                        })
                      }
                      disabled={setAdminLock.isPending}
                    >
                      <Unlock className="w-4 h-4 mr-2" />
                      Release lockdown
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        setAdminLock.mutate({
                          deviceId: device.id,
                          locked: true,
                        })
                      }
                      disabled={setAdminLock.isPending || !device.deviceToken}
                      title={
                        !device.deviceToken
                          ? "Device must be paired first"
                          : "Immediately lock this device"
                      }
                    >
                      <Lock className="w-4 h-4 mr-2" />
                      LOCK DOWN
                    </Button>
                  )}

                  {device.isOnline && isSupabaseConfigured() && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          requestCapture.mutate({
                            deviceId: device.id,
                            type: "screen",
                          })
                        }
                        disabled={requestCapture.isPending}
                        title="Capture screen"
                      >
                        <Camera className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          requestCapture.mutate({
                            deviceId: device.id,
                            type: "webcam",
                          })
                        }
                        disabled={requestCapture.isPending}
                        title="Capture webcam"
                      >
                        <Video className="w-4 h-4" />
                      </Button>
                    </>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => confirmDeleteDevice(device)}
                    disabled={deleteDevice.isPending}
                    title="Remove device"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}

            {pairingCode ? (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Enter this code in the Windows agent
                </p>
                <p className="text-4xl font-mono font-bold tracking-widest mb-2">
                  {pairingCode.code}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Expires {new Date(pairingCode.expiresAt).toLocaleTimeString()}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(pairingCode.code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {copied ? "Copied!" : "Copy code"}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={async () => {
                  const result = await generateCode.mutateAsync({ childId });
                  setPairingCode({
                    code: result.code,
                    expiresAt: result.expiresAt,
                  });
                }}
                disabled={generateCode.isPending}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Generate pairing code
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
