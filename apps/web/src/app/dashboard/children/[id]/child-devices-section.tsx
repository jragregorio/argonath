"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFamilyRealtimeEvent } from "@/lib/family-realtime";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SwipeToLock } from "@/components/swipe-to-lock";
import { getDeviceDisplayName } from "@warden/shared";
import {
  Camera,
  Copy,
  Monitor,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Unlock,
  Video,
  Download,
} from "lucide-react";
import { isSupabaseConfigured } from "@/lib/dev-config";
import { useDeviceActions } from "@/lib/use-device-actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { NudgeControls } from "@/components/nudge-controls";
import { useToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";
import {
  captureToneClass,
  formatCountdown,
  type CaptureFeedback,
  type PairingCodeState,
} from "./child-detail-helpers";

type DeviceRecord = {
  id: string;
  displayName?: string | null;
  machineName?: string | null;
  agentVersion?: string | null;
  lastSeenAt?: Date | string | null;
  isOnline: boolean;
  isPaired: boolean;
  adminLock: boolean;
  isLocked: boolean;
  lastUncleanExitAt?: Date | string | null;
};

type ChildForDevices = {
  displayName: string;
  devices: DeviceRecord[];
};

type ChildDevicesSectionProps = {
  child: ChildForDevices;
  childId: string;
};

// Re-enable after Supabase plan upgrade (Free plan caps Storage objects at 50MB;
// the MSI is ~84MB). Publish with: npm run publish:agent -- --msi …
const INSTALLER_DOWNLOAD_ENABLED = false;

export function ChildDevicesSection({
  child,
  childId,
}: ChildDevicesSectionProps) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const isDesktop = useIsDesktopMd();

  const generateCode = trpc.device.generatePairingCode.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
    },
  });
  const renameDevice = trpc.device.rename.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
      setEditingDeviceId(null);
    },
  });
  const deleteDevice = trpc.device.delete.useMutation({
    onSuccess: () => {
      utils.children.get.invalidate({ childId });
      utils.device.list.invalidate();
      utils.dashboard.overview.invalidate();
    },
  });
  const dismissUncleanExit = trpc.device.dismissUncleanExit.useMutation({
    onSuccess: () => {
      void utils.children.get.invalidate({ childId });
      void utils.device.list.invalidate();
    },
  });

  const { data: latestRelease, isLoading: latestReleaseLoading } =
    trpc.agentRelease.latest.useQuery(undefined, {
      enabled: INSTALLER_DOWNLOAD_ENABLED,
    });

  const {
    pendingLocks,
    nudgeByDevice,
    setAdminLock,
    sendNudge,
    getEffectiveAdminLock,
  } = useDeviceActions({
    devices: child.devices,
    childId,
    scope: "child",
    getDeviceLabel: (deviceId) => {
      const device = child.devices.find((d) => d.id === deviceId);
      return device ? getDeviceDisplayName(device) : "Device";
    },
    getChildLabel: () => child.displayName,
  });

  const [captureFeedback, setCaptureFeedback] = useState<
    Record<string, CaptureFeedback>
  >({});
  const capturePollersRef = useRef<Record<string, number>>({});

  const clearCaptureFeedbackSoon = (deviceId: string, delayMs = 3000) => {
    window.setTimeout(() => {
      setCaptureFeedback((prev) => {
        const next = { ...prev };
        delete next[deviceId];
        return next;
      });
    }, delayMs);
  };

  const stopCapturePoll = (deviceId: string) => {
    const timer = capturePollersRef.current[deviceId];
    if (timer) {
      window.clearInterval(timer);
      delete capturePollersRef.current[deviceId];
    }
  };

  const finishCaptureSuccess = (deviceId: string) => {
    stopCapturePoll(deviceId);
    setCaptureFeedback((prev) => ({
      ...prev,
      [deviceId]: { message: "Capture received", tone: "success" },
    }));
    showToast("Capture received", "success");
    clearCaptureFeedbackSoon(deviceId, 4000);
    // Poll path often wins before realtime; refresh Snapshots badge immediately.
    void utils.dashboard.navBadges.invalidate();
    void utils.snapshot.list.invalidate();
    void utils.dashboard.activity.invalidate();
  };

  const finishCaptureFailure = (deviceId: string, message: string) => {
    stopCapturePoll(deviceId);
    setCaptureFeedback((prev) => ({
      ...prev,
      [deviceId]: { message, tone: "error" },
    }));
    showToast(message, "error");
    clearCaptureFeedbackSoon(deviceId, 6000);
  };

  const watchCaptureStatus = (deviceId: string, snapshotId: string) => {
    stopCapturePoll(deviceId);

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const status = await utils.snapshot.getStatus.fetch({ snapshotId });
          if (status.status === "ready") {
            finishCaptureSuccess(deviceId);
            return;
          }
          if (status.status === "failed") {
            finishCaptureFailure(deviceId, "Capture failed");
            return;
          }
          if (Date.now() - startedAt > 20_000) {
            finishCaptureFailure(deviceId, "Timed out — try again");
          }
        } catch {
          if (Date.now() - startedAt > 20_000) {
            finishCaptureFailure(deviceId, "Timed out — try again");
          }
        }
      })();
    }, 1000);

    capturePollersRef.current[deviceId] = timer;
  };

  useEffect(() => {
    return () => {
      Object.values(capturePollersRef.current).forEach((timer) =>
        window.clearInterval(timer)
      );
      capturePollersRef.current = {};
    };
  }, []);

  const requestCapture = trpc.snapshot.requestCapture.useMutation({
    onMutate: ({ deviceId, type }) => {
      const startedMessage =
        type === "screen"
          ? "Requesting screenshot…"
          : "Requesting webcam capture…";
      setCaptureFeedback((prev) => ({
        ...prev,
        [deviceId]: { message: startedMessage, tone: "pending" },
      }));
      showToast(startedMessage);
    },
    onSuccess: (data, { deviceId, type }) => {
      const waitingMessage =
        type === "screen"
          ? "Screenshot requested — waiting for device…"
          : "Webcam capture requested — waiting for device…";
      setCaptureFeedback((prev) => ({
        ...prev,
        [deviceId]: { message: waitingMessage, tone: "pending" },
      }));
      watchCaptureStatus(deviceId, data.id);
    },
    onError: (err, { deviceId }) => {
      finishCaptureFailure(deviceId, err.message || "Capture failed");
    },
  });

  const [pairingCode, setPairingCode] = useState<PairingCodeState | null>(null);
  const [pairingNotice, setPairingNotice] = useState<string | null>(null);
  const [pairingTick, setPairingTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceNameDraft, setDeviceNameDraft] = useState("");
  const [deviceMoreOpenId, setDeviceMoreOpenId] = useState<string | null>(null);
  const [deleteDeviceTarget, setDeleteDeviceTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const deviceMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!deviceMoreOpenId || !isDesktop) return;

    const onPointerDown = (event: MouseEvent) => {
      if (
        deviceMoreRef.current &&
        !deviceMoreRef.current.contains(event.target as Node)
      ) {
        setDeviceMoreOpenId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeviceMoreOpenId(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [deviceMoreOpenId, isDesktop]);

  useEffect(() => {
    if (!pairingCode) return;

    const expiresAt = new Date(pairingCode.expiresAt).getTime();
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      setPairingCode(null);
      setPairingNotice("Pairing code expired — generate a new one");
      return;
    }

    const expireTimer = window.setTimeout(() => {
      setPairingCode(null);
      setPairingNotice("Pairing code expired — generate a new one");
    }, remaining);

    const tickTimer = window.setInterval(() => {
      setPairingTick((value) => value + 1);
    }, 1000);

    return () => {
      window.clearTimeout(expireTimer);
      window.clearInterval(tickTimer);
    };
  }, [pairingCode]);

  useEffect(() => {
    if (!pairingNotice) return;
    const timer = window.setTimeout(() => setPairingNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [pairingNotice]);

  useEffect(() => {
    if (!pairingCode) return;
    const device = child.devices.find((d) => d.id === pairingCode.deviceId);
    if (device?.isPaired) {
      setPairingCode(null);
      setPairingNotice("Device paired successfully");
    }
  }, [child, pairingCode]);

  const pairingRemainingMs = useMemo(() => {
    if (!pairingCode) return 0;
    void pairingTick;
    return new Date(pairingCode.expiresAt).getTime() - Date.now();
  }, [pairingCode, pairingTick]);

  const deviceIds = child.devices.map((d) => d.id);
  useFamilyRealtimeEvent((event) => {
    if (!deviceIds.includes(event.deviceId)) return;

    if (event.type === "snapshot:ready") {
      finishCaptureSuccess(event.deviceId);
    }
    if (event.type === "snapshot:failed") {
      const payload = event.payload as { errorMessage?: string } | undefined;
      finishCaptureFailure(
        event.deviceId,
        payload?.errorMessage || "Capture failed"
      );
    }
  });

  const deviceMoreTarget = child.devices.find((d) => d.id === deviceMoreOpenId);

  const startRenameDevice = (device: DeviceRecord) => {
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

  const requestDeleteDevice = (device: DeviceRecord) => {
    setDeleteDeviceTarget({
      id: device.id,
      label: getDeviceDisplayName(device),
    });
  };

  const renderPairingContent = () =>
    pairingCode ? (
      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Enter this code in the Windows agent
        </p>
        <p className="text-4xl font-mono font-bold tracking-widest">
          {pairingCode.code}
        </p>
        <p className="text-sm font-medium tabular-nums">
          Expires in {formatCountdown(pairingRemainingMs)}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(pairingCode.expiresAt).toLocaleTimeString()}
        </p>
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-2 pt-1">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              void navigator.clipboard.writeText(pairingCode.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            <Copy className="w-4 h-4 mr-2" />
            {copied ? "Copied!" : "Copy code"}
          </Button>
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={() => setPairingCode(null)}
          >
            Dismiss
          </Button>
        </div>
      </div>
    ) : null;

  async function startPairing() {
    const result = await generateCode.mutateAsync({ childId });
    setPairingNotice(null);
    setPairingCode({
      code: result.code,
      expiresAt: new Date(result.expiresAt),
      deviceId: result.deviceId,
    });
  }

  return (
    <>
      <Card className="order-1 flex w-full flex-col">
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <CardDescription>
            Pair the Windows agent using a one-time code
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            {child.devices.map((device) => {
              const pendingLock = pendingLocks[device.id];
              const effectiveAdminLock = getEffectiveAdminLock(device);
              const feedback = captureFeedback[device.id];
              const captureBusy = feedback?.tone === "pending";

              return (
                <div
                  key={device.id}
                  className="flex min-h-[12rem] flex-col gap-4 rounded-lg border border-border p-4 max-md:p-5 sm:p-5"
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
                              onChange={(e) =>
                                setDeviceNameDraft(e.target.value)
                              }
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
                            <p className="truncate text-lg font-semibold tracking-tight">
                              {getDeviceDisplayName(device)}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 max-md:min-h-11 max-md:min-w-11 max-md:h-11"
                              onClick={() => startRenameDevice(device)}
                              title="Rename device"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                        <div className="text-sm md:text-xs text-muted-foreground">
                          <p>
                            {child.displayName} Agent v
                            {device.agentVersion ?? "?"}
                          </p>
                          <p>
                            {device.lastSeenAt
                              ? new Date(device.lastSeenAt).toLocaleString()
                              : "Never connected"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 md:flex-row md:items-center md:gap-2">
                      <Badge
                        variant={device.isOnline ? "success" : "secondary"}
                      >
                        {device.isOnline ? "Online" : "Offline"}
                      </Badge>
                      {device.lastUncleanExitAt && (
                        <Badge variant="destructive">Unclean exit</Badge>
                      )}
                      {effectiveAdminLock && (
                        <Badge variant="destructive">Locked down</Badge>
                      )}
                      {pendingLock !== undefined && (
                        <Badge variant="secondary">
                          {pendingLock
                            ? "Sending lock..."
                            : "Waiting for unlock..."}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {device.lastUncleanExitAt && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                      <p>
                        Warden on this device did not shut down cleanly
                        {device.lastUncleanExitAt
                          ? ` (detected ${new Date(device.lastUncleanExitAt).toLocaleString()})`
                          : ""}
                        . That usually means Task Manager End Task, a crash, or
                        a hard power cut — not a normal Exit. It should
                        auto-relaunch within about a minute.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7"
                        disabled={dismissUncleanExit.isPending}
                        onClick={() =>
                          dismissUncleanExit.mutate({ deviceId: device.id })
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 max-md:gap-3">
                    {nudgeByDevice[device.id]?.label && (
                      <span className="block break-words text-sm text-muted-foreground md:text-xs">
                        {nudgeByDevice[device.id].label}
                      </span>
                    )}
                    <div className="flex flex-col gap-2 max-md:gap-3 sm:flex-row sm:items-stretch">
                      <NudgeControls
                        className="w-full sm:w-52 sm:shrink-0"
                        disabled={
                          !device.isPaired ||
                          !device.isOnline ||
                          Boolean(nudgeByDevice[device.id]?.nudgeId)
                        }
                        isSending={
                          sendNudge.isPending &&
                          sendNudge.variables?.deviceId === device.id
                        }
                        title={
                          !device.isPaired
                            ? "Device must be paired first"
                            : !device.isOnline
                              ? "Device is offline"
                              : "Send a gentle attention nudge"
                        }
                        onSend={(message) =>
                          sendNudge.mutate({
                            deviceId: device.id,
                            message,
                          })
                        }
                      />
                      <div className="flex w-full min-w-0 items-stretch gap-2 max-md:gap-3 sm:flex-1">
                        {effectiveAdminLock ? (
                          <Button
                            variant="outline"
                            className="min-w-0 flex-1"
                            onClick={() =>
                              setAdminLock.mutate({
                                deviceId: device.id,
                                locked: false,
                              })
                            }
                          >
                            <Unlock className="mr-2 h-4 w-4" />
                            Release
                          </Button>
                        ) : (
                          <SwipeToLock
                            className="min-w-0 flex-1"
                            onConfirm={() =>
                              setAdminLock.mutate({
                                deviceId: device.id,
                                locked: true,
                              })
                            }
                            disabled={!device.isPaired}
                            pending={
                              setAdminLock.isPending &&
                              setAdminLock.variables?.deviceId === device.id &&
                              setAdminLock.variables?.locked === true
                            }
                            title={
                              !device.isPaired
                                ? "Device must be paired first"
                                : "Swipe to immediately lock this device"
                            }
                          />
                        )}

                        <div
                          className="relative shrink-0"
                          ref={
                            deviceMoreOpenId === device.id
                              ? deviceMoreRef
                              : undefined
                          }
                        >
                          <Button
                            variant="outline"
                            className="px-3 max-md:min-w-11"
                            onClick={() =>
                              setDeviceMoreOpenId((prev) =>
                                prev === device.id ? null : device.id
                              )
                            }
                            aria-expanded={deviceMoreOpenId === device.id}
                            aria-haspopup="menu"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">More</span>
                          </Button>
                          {isDesktop && deviceMoreOpenId === device.id && (
                            <div
                              role="menu"
                              className="absolute right-0 z-20 mt-1.5 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
                            >
                              {device.isOnline && isSupabaseConfigured() && (
                                <>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-secondary disabled:opacity-50"
                                    disabled={captureBusy}
                                    onClick={() => {
                                      setDeviceMoreOpenId(null);
                                      requestCapture.mutate({
                                        deviceId: device.id,
                                        type: "screen",
                                      });
                                    }}
                                  >
                                    <Camera className="w-4 h-4 text-muted-foreground" />
                                    Screenshot
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-secondary disabled:opacity-50"
                                    disabled={captureBusy}
                                    onClick={() => {
                                      setDeviceMoreOpenId(null);
                                      requestCapture.mutate({
                                        deviceId: device.id,
                                        type: "webcam",
                                      });
                                    }}
                                  >
                                    <Video className="w-4 h-4 text-muted-foreground" />
                                    Webcam
                                  </button>
                                  <div className="my-1 border-t border-border" />
                                </>
                              )}
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-secondary disabled:opacity-50"
                                disabled={deleteDevice.isPending}
                                onClick={() => {
                                  setDeviceMoreOpenId(null);
                                  requestDeleteDevice(device);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove device
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {feedback?.tone === "pending" && (
                    <p
                      className={`text-xs ${captureToneClass(feedback.tone)}`}
                      role="status"
                    >
                      {feedback.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {pairingCode ? (
            <div className="hidden md:block p-4 rounded-lg bg-primary/10 border border-primary/30">
              {renderPairingContent()}
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full max-md:mt-1 sm:w-auto"
              onClick={() => void startPairing()}
              disabled={generateCode.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {generateCode.isPending
                ? "Generating..."
                : "Generate pairing code"}
            </Button>
          )}

          <div className="hidden space-y-2 border-t border-border pt-4 md:block">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={
                !INSTALLER_DOWNLOAD_ENABLED ||
                !latestRelease?.downloadUrl ||
                latestReleaseLoading
              }
              onClick={() => {
                if (
                  !INSTALLER_DOWNLOAD_ENABLED ||
                  !latestRelease?.downloadUrl
                ) {
                  return;
                }
                window.open(
                  latestRelease.downloadUrl,
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
              title={
                !INSTALLER_DOWNLOAD_ENABLED
                  ? "Temporarily unavailable"
                  : latestRelease
                    ? `Download Warden ${latestRelease.version} for Windows`
                    : "Installer not published yet"
              }
            >
              <Download className="w-4 h-4 mr-2" />
              Download for Windows
            </Button>
            {!INSTALLER_DOWNLOAD_ENABLED ? (
              <p className="text-xs text-muted-foreground">
                Temporarily unavailable
              </p>
            ) : latestReleaseLoading ? (
              <p className="text-xs text-muted-foreground">
                Checking for installer…
              </p>
            ) : latestRelease ? (
              <p className="text-xs text-muted-foreground">
                v{latestRelease.version}
                {latestRelease.sizeBytes > 0
                  ? ` · ~${(latestRelease.sizeBytes / (1024 * 1024)).toFixed(0)} MB`
                  : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Installer not published yet
              </p>
            )}
          </div>

          {pairingNotice && (
            <p
              className={`text-sm text-center ${
                pairingNotice.includes("successfully")
                  ? "text-green-400"
                  : "text-muted-foreground"
              }`}
              role="status"
            >
              {pairingNotice}
            </p>
          )}
        </CardContent>
      </Card>

      <BottomSheet
        open={Boolean(pairingCode)}
        onClose={() => setPairingCode(null)}
        title="Pairing code"
        description="Enter this code in the Windows agent"
      >
        {renderPairingContent()}
      </BottomSheet>

      {deviceMoreTarget && (
        <BottomSheet
          open={!isDesktop && deviceMoreOpenId === deviceMoreTarget.id}
          onClose={() => setDeviceMoreOpenId(null)}
          title={getDeviceDisplayName(deviceMoreTarget)}
          showDone={false}
        >
          <div className="flex flex-col gap-3 pb-1">
            {deviceMoreTarget.isOnline && isSupabaseConfigured() && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-3 max-md:min-h-14"
                  disabled={
                    captureFeedback[deviceMoreTarget.id]?.tone === "pending"
                  }
                  onClick={() => {
                    setDeviceMoreOpenId(null);
                    requestCapture.mutate({
                      deviceId: deviceMoreTarget.id,
                      type: "screen",
                    });
                  }}
                >
                  <Camera className="h-5 w-5" />
                  Screenshot
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-3 max-md:min-h-14"
                  disabled={
                    captureFeedback[deviceMoreTarget.id]?.tone === "pending"
                  }
                  onClick={() => {
                    setDeviceMoreOpenId(null);
                    requestCapture.mutate({
                      deviceId: deviceMoreTarget.id,
                      type: "webcam",
                    });
                  }}
                >
                  <Video className="h-5 w-5" />
                  Webcam
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="destructive"
              className="w-full justify-start gap-3 max-md:min-h-14"
              disabled={deleteDevice.isPending}
              onClick={() => {
                setDeviceMoreOpenId(null);
                requestDeleteDevice(deviceMoreTarget);
              }}
            >
              <Trash2 className="h-5 w-5" />
              Remove device
            </Button>
          </div>
        </BottomSheet>
      )}

      <ConfirmDialog
        open={deleteDeviceTarget !== null}
        onClose={() => setDeleteDeviceTarget(null)}
        title="Remove device?"
        description={
          deleteDeviceTarget
            ? `Remove device "${deleteDeviceTarget.label}"? The agent will need to be paired again to reconnect.`
            : ""
        }
        confirmLabel="Remove device"
        busy={deleteDevice.isPending}
        onConfirm={() => {
          if (!deleteDeviceTarget) return;
          deleteDevice.mutate(
            { deviceId: deleteDeviceTarget.id },
            { onSuccess: () => setDeleteDeviceTarget(null) }
          );
        }}
      />
    </>
  );
}
