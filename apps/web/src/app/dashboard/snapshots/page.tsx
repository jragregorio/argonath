"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { useFamilyRealtimeEvent } from "@/lib/family-realtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { SnapshotsGridSkeleton } from "@/components/dashboard-skeletons";
import { getDeviceDisplayName } from "@warden/shared";
import { cn } from "@warden/ui";
import { Camera, CheckSquare, Loader2, Square, Trash2, Video, X } from "lucide-react";
import { ZoomableImage } from "@/components/zoomable-image";
import { POLL_LIVE_MS, POLL_SAFETY_MS } from "@/lib/query-defaults";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  notifyBlockingOverlayClose,
  notifyBlockingOverlayOpen,
} from "@/lib/overlay-events";

type SnapshotStatusFilter = "all" | "ready" | "pending" | "failed";

type DeleteConfirmState =
  | { type: "single"; snapshotId: string }
  | { type: "bulk"; snapshotIds: string[] }
  | null;

function statusBadgeVariant(status: string) {
  if (status === "ready") return "success" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "pending") return "warning" as const;
  return "secondary" as const;
}

function statusLabel(status: string) {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "pending") return "Pending";
  return status;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium min-h-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary"
      )}
    >
      {children}
    </button>
  );
}

export default function SnapshotsPage() {
  const utils = trpc.useUtils();
  const [childFilter, setChildFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] =
    useState<SnapshotStatusFilter>("all");
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);

  const listInput = {
    ...(childFilter !== "all" ? { childId: childFilter } : {}),
    status: statusFilter,
  };

  const { data: children } = trpc.children.list.useQuery();
  const { data: snapshots, isLoading } = trpc.snapshot.list.useQuery(listInput, {
    placeholderData: keepPreviousData,
    // snapshot:ready / snapshot:failed invalidate; poll faster while pending
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (rows?.some((s) => s.status === "pending")) return POLL_LIVE_MS;
      return POLL_SAFETY_MS;
    },
  });
  const markAllViewed = trpc.snapshot.markAllViewed.useMutation({
    onSuccess: () => {
      utils.dashboard.navBadges.invalidate();
    },
  });

  const invalidateAfterDelete = () => {
    utils.snapshot.list.invalidate();
    utils.dashboard.navBadges.invalidate();
    utils.dashboard.activity.invalidate();
  };

  const deleteSnapshot = trpc.snapshot.delete.useMutation({
    onSuccess: (_data, variables) => {
      invalidateAfterDelete();
      setSelectedIds((prev) => {
        if (!prev.has(variables.snapshotId)) return prev;
        const next = new Set(prev);
        next.delete(variables.snapshotId);
        return next;
      });
      setLightboxId((current) =>
        current && variables.snapshotId === current ? null : current
      );
    },
  });

  const deleteManySnapshots = trpc.snapshot.deleteMany.useMutation({
    onSuccess: (_data, variables) => {
      invalidateAfterDelete();
      const deleted = new Set(variables.snapshotIds);
      setSelectedIds((prev) => {
        const next = new Set([...prev].filter((id) => !deleted.has(id)));
        return next;
      });
      setLightboxId((current) =>
        current && deleted.has(current) ? null : current
      );
    },
  });

  const isDeleting =
    deleteSnapshot.isPending || deleteManySnapshots.isPending;

  useEffect(() => {
    markAllViewed.mutate();
    // Mark ready snapshots as viewed once when opening this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only
  }, []);

  useFamilyRealtimeEvent((event) => {
    if (
      event.type === "snapshot:ready" ||
      event.type === "snapshot:failed"
    ) {
      markAllViewed.mutate();
    }
  });

  useEffect(() => {
    if (!lightboxId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxId]);

  const lightbox = snapshots?.find((snapshot) => snapshot.id === lightboxId);
  const { data: signedUrlData, isLoading: signedUrlLoading } =
    trpc.snapshot.getSignedUrl.useQuery(
      { snapshotId: lightboxId! },
      {
        enabled: Boolean(lightboxId && lightbox?.status === "ready"),
        staleTime: 3000 * 1000,
      }
    );
  const lightboxUrl = signedUrlData?.url ?? null;
  const lightboxOpen = Boolean(lightboxId && lightbox);

  useEffect(() => {
    if (!lightboxOpen) return;
    notifyBlockingOverlayOpen();
    return () => notifyBlockingOverlayClose();
  }, [lightboxOpen]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [childFilter, statusFilter]);

  useEffect(() => {
    if (!snapshots) return;
    const visible = new Set(snapshots.map((snapshot) => snapshot.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [snapshots]);

  const visibleIds = useMemo(
    () => snapshots?.map((snapshot) => snapshot.id) ?? [],
    [snapshots]
  );
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleSelected = (snapshotId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(snapshotId)) next.delete(snapshotId);
      else next.add(snapshotId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) return new Set();
      return new Set(visibleIds);
    });
  };

  const confirmDelete = (snapshotId: string) => {
    setDeleteConfirm({ type: "single", snapshotId });
  };

  const confirmBulkDelete = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setDeleteConfirm({ type: "bulk", snapshotIds: ids });
  };

  const statusChips: { value: SnapshotStatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "ready", label: "Ready" },
    { value: "pending", label: "Pending" },
    { value: "failed", label: "Failed" },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="Snapshots"
        description="On-demand screen and webcam captures from your children's devices"
      />

      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-2 px-0.5">Child</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterChip
              active={childFilter === "all"}
              onClick={() => setChildFilter("all")}
            >
              All
            </FilterChip>
            {children?.map((child) => (
              <FilterChip
                key={child.id}
                active={childFilter === child.id}
                onClick={() => setChildFilter(child.id)}
              >
                {child.displayName}
              </FilterChip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2 px-0.5">Status</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statusChips.map((chip) => (
              <FilterChip
                key={chip.value}
                active={statusFilter === chip.value}
                onClick={() => setStatusFilter(chip.value)}
              >
                {chip.label}
              </FilterChip>
            ))}
          </div>
        </div>
      </div>

      {!isLoading && snapshots && snapshots.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAllVisible}
              disabled={isDeleting}
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-4 h-4 mr-1.5" />
              ) : (
                <Square className="w-4 h-4 mr-1.5" />
              )}
              {allVisibleSelected ? "Clear selection" : "Select all"}
            </Button>
            {selectedCount > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedCount} selected
              </span>
            )}
          </div>
          {selectedCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto"
              onClick={confirmBulkDelete}
              disabled={isDeleting}
            >
              {deleteManySnapshots.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5" />
              )}
              Delete selected
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <SnapshotsGridSkeleton />
      ) : snapshots && snapshots.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {snapshots.map((snapshot) => {
            const selected = selectedIds.has(snapshot.id);
            return (
              <Card
                key={snapshot.id}
                className={cn(
                  "overflow-hidden p-0 transition-shadow",
                  selected && "ring-2 ring-primary"
                )}
              >
                <div className="relative">
                  <button
                    type="button"
                    className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background/90 text-foreground shadow-sm hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => toggleSelected(snapshot.id)}
                    aria-pressed={selected}
                    aria-label={
                      selected
                        ? `Deselect snapshot from ${snapshot.child.displayName}`
                        : `Select snapshot from ${snapshot.child.displayName}`
                    }
                    disabled={isDeleting}
                  >
                    {selected ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="aspect-video bg-secondary relative w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      if (snapshot.status === "ready") {
                        setLightboxId(snapshot.id);
                      }
                    }}
                    disabled={snapshot.status !== "ready"}
                  >
                    {snapshot.status === "ready" ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                        {snapshot.type === "screen" ? (
                          <Camera className="w-8 h-8" />
                        ) : (
                          <Video className="w-8 h-8" />
                        )}
                        <span className="text-xs">Tap to view</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                        {snapshot.status === "pending" ? (
                          <Loader2 className="w-8 h-8 animate-spin" />
                        ) : snapshot.type === "screen" ? (
                          <Camera className="w-8 h-8" />
                        ) : (
                          <Video className="w-8 h-8" />
                        )}
                        <span className="text-xs">
                          {snapshot.status === "pending"
                            ? "Waiting for device…"
                            : snapshot.status === "failed"
                              ? "Capture failed"
                              : "Preview unavailable"}
                        </span>
                      </div>
                    )}
                  </button>
                </div>
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm truncate">
                      {snapshot.child.displayName}
                    </CardTitle>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={statusBadgeVariant(snapshot.status)}>
                        {statusLabel(snapshot.status)}
                      </Badge>
                      <Badge variant="secondary">
                        {snapshot.type === "screen" ? "Screen" : "Webcam"}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription>
                    {getDeviceDisplayName(snapshot.device)} ·{" "}
                    {new Date(snapshot.capturedAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-0 flex gap-2">
                  {snapshot.status === "ready" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLightboxId(snapshot.id)}
                    >
                      View
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => confirmDelete(snapshot.id)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No snapshots match these filters.</p>
            <p className="text-sm mt-1">
              Open a child, then use More (⋯) on a device for Screenshot or
              Webcam.
            </p>
          </CardContent>
        </Card>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label="Snapshot preview"
          onClick={() => setLightboxId(null)}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 text-white"
            style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="font-medium truncate text-sm sm:text-base">
                {lightbox.child.displayName} ·{" "}
                {lightbox.type === "screen" ? "Screen" : "Webcam"}
              </p>
              <p className="text-xs text-white/70 sm:text-sm">
                {getDeviceDisplayName(lightbox.device)} ·{" "}
                {new Date(lightbox.capturedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                onClick={() => confirmDelete(lightbox.id)}
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-white hover:bg-white/10 min-h-11 min-w-11"
                onClick={() => setLightboxId(null)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div
            className="relative flex min-h-0 flex-1 flex-col px-0"
            style={{
              paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {signedUrlLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-white/70" />
              </div>
            ) : lightboxUrl ? (
              <ZoomableImage
                src={lightboxUrl}
                alt={`${lightbox.type} capture`}
                className="flex h-full min-h-0 flex-1"
                fillViewport
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-white/70 text-sm">
                Preview unavailable
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={
          deleteConfirm?.type === "bulk" ? "Delete snapshots?" : "Delete snapshot?"
        }
        description={
          deleteConfirm?.type === "bulk"
            ? `Delete ${deleteConfirm.snapshotIds.length} snapshot${deleteConfirm.snapshotIds.length === 1 ? "" : "s"}? This cannot be undone.`
            : "Delete this snapshot? This cannot be undone."
        }
        confirmLabel="Delete"
        busy={deleteSnapshot.isPending || deleteManySnapshots.isPending}
        onConfirm={() => {
          if (!deleteConfirm) return;
          if (deleteConfirm.type === "single") {
            deleteSnapshot.mutate(
              { snapshotId: deleteConfirm.snapshotId },
              { onSuccess: () => setDeleteConfirm(null) }
            );
          } else {
            deleteManySnapshots.mutate(
              { snapshotIds: deleteConfirm.snapshotIds },
              { onSuccess: () => setDeleteConfirm(null) }
            );
          }
        }}
      />
    </div>
  );
}
