"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ChildrenListSkeleton } from "@/components/dashboard-skeletons";
import {
  getDeviceDisplayName,
  getEvaluationStatusLabel,
} from "@warden/shared";
import { MoreHorizontal, Pencil, Plus, Trash2, User } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  evaluationStatusBadgeVariant,
  getPolicyRemainingDisplay,
} from "@/lib/policy-remaining-display";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { useRouter } from "next/navigation";
import { cn } from "@warden/ui";
import { POLL_HEARTBEAT_MS } from "@/lib/query-defaults";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  ChildRosterList,
  type ChildRosterItem,
} from "@/components/child-roster-list";

type DeleteConfirmState = {
  childId: string;
  displayName: string;
  deviceCount: number;
} | null;

export default function ChildrenPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: children, isLoading } = trpc.children.list.useQuery(undefined, {
    // Online badges / usage follow heartbeats; Realtime covers lock/policy/extension
    refetchInterval: POLL_HEARTBEAT_MS,
  });
  const { data: overview } = trpc.dashboard.overview.useQuery(undefined, {
    refetchInterval: POLL_HEARTBEAT_MS,
  });

  const evaluationByChildId = useMemo(
    () =>
      new Map(
        (overview?.children ?? []).map((c) => [c.id, c.evaluation] as const)
      ),
    [overview?.children]
  );

  const rosterItems: ChildRosterItem[] = useMemo(() => {
    if (!children) return [];
    return children.map((child) => ({
      id: child.id,
      displayName: child.displayName,
      href: `/dashboard/children/${child.id}`,
      devices: child.devices.map((device) => ({
        id: device.id,
        displayName: device.displayName,
        machineName: device.machineName,
        isOnline: device.isOnline,
        lastSeenAt: device.lastSeenAt,
      })),
      evaluation: evaluationByChildId.get(child.id),
    }));
  }, [children, evaluationByChildId]);
  const createChild = trpc.children.create.useMutation({
    onSuccess: () => {
      utils.children.list.invalidate();
      setName("");
      setShowForm(false);
    },
  });
  const renameChild = trpc.children.rename.useMutation({
    onSuccess: () => {
      utils.children.list.invalidate();
      utils.device.list.invalidate();
      setEditingId(null);
    },
  });
  const deleteChild = trpc.children.delete.useMutation({
    onSuccess: () => {
      utils.children.list.invalidate();
      utils.device.list.invalidate();
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Children"
        description="Manage child profiles and their devices"
        action={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-2" />
            Add child
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add a child</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) createChild.mutate({ displayName: name.trim() });
              }}
              className="flex gap-4 items-end"
            >
              <div className="flex-1">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="mt-1"
                />
              </div>
              <Button type="submit" disabled={createChild.isPending}>
                {createChild.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
            {createChild.error && (
              <p className="mt-3 text-sm text-destructive">
                {createChild.error.message || "Failed to create child. Check that you are signed in."}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <ChildrenListSkeleton />
      ) : children && children.length > 0 ? (
        <>
        <ChildRosterList items={rosterItems} className="md:hidden" />
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((child) => {
            const isEditing = editingId === child.id;
            const evaluation = evaluationByChildId.get(child.id);
            const remainingDisplay = evaluation
              ? getPolicyRemainingDisplay(evaluation)
              : null;
            const remainingText = remainingDisplay
              ? (remainingDisplay.primaryText ?? remainingDisplay.statusText)
              : null;
            const manageHref = `/dashboard/children/${child.id}`;

            const navigateToManage = () => {
              if (!isEditing) router.push(manageHref);
            };

            const handleCardKeyDown = (e: React.KeyboardEvent) => {
              if (isEditing) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigateToManage();
              }
            };

            return (
            <Card
              key={child.id}
              role={isEditing ? undefined : "link"}
              tabIndex={isEditing ? undefined : 0}
              onClick={navigateToManage}
              onKeyDown={handleCardKeyDown}
              className={cn(
                !isEditing &&
                  "cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <CardHeader>
                {isEditing ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const next = editName.trim();
                      if (!next || next === child.displayName) {
                        setEditingId(null);
                        return;
                      }
                      renameChild.mutate({
                        childId: child.id,
                        displayName: next,
                      });
                    }}
                  >
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-9"
                      autoFocus
                      maxLength={50}
                    />
                    <Button type="submit" size="sm" disabled={renameChild.isPending}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5 shrink-0" />
                    <span className="truncate">{child.displayName}</span>
                    {evaluation && (
                      <Badge
                        variant={evaluationStatusBadgeVariant(evaluation)}
                        className="shrink-0"
                      >
                        {getEvaluationStatusLabel(evaluation)}
                      </Badge>
                    )}
                    <Popover
                      open={menuOpenId === child.id}
                      onOpenChange={(open) =>
                        setMenuOpenId(open ? child.id : null)
                      }
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7 w-7 shrink-0 p-0"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          aria-label={`More actions for ${child.displayName}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="min-w-[10rem] py-1"
                        // Portal content still bubbles through the React tree
                        // to the card's navigate-on-click/Enter handlers.
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-secondary"
                            onClick={() => {
                              setMenuOpenId(null);
                              setEditingId(child.id);
                              setEditName(child.displayName);
                            }}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                            Rename
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            disabled={deleteChild.isPending}
                            onClick={() => {
                              setMenuOpenId(null);
                              setDeleteConfirm({
                                childId: child.id,
                                displayName: child.displayName,
                                deviceCount: child.devices.length,
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete child…
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </CardTitle>
                )}
                {evaluation ? (
                  <CardDescription className="space-y-0.5">
                    <span className="block font-medium text-foreground tabular-nums">
                      {evaluation.usedMinutes} / {evaluation.dailyLimitMinutes}{" "}
                      min today
                    </span>
                    {remainingText && (
                      <span className="block">{remainingText}</span>
                    )}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent>
                {child.devices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No devices paired
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {child.devices.map((device) => (
                      <li
                        key={device.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            device.isOnline
                              ? "bg-primary"
                              : "bg-muted-foreground/40"
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 truncate font-medium">
                          {getDeviceDisplayName(device)}
                        </span>
                        <span
                          className="ml-auto shrink-0 text-xs text-muted-foreground"
                          title={
                            device.agentVersion
                              ? `Agent v${device.agentVersion}`
                              : undefined
                          }
                        >
                          {device.isOnline
                            ? "Online"
                            : device.lastSeenAt
                              ? `Seen ${formatRelativeTime(device.lastSeenAt)}`
                              : "Never connected"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No children added yet. Add your first child to get started.</p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Delete child?"
        description={
          deleteConfirm
            ? `Delete ${deleteConfirm.displayName} and ${deleteConfirm.deviceCount} connected device${deleteConfirm.deviceCount === 1 ? "" : "s"}? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete child"
        busy={deleteChild.isPending}
        onConfirm={() => {
          if (!deleteConfirm) return;
          deleteChild.mutate(
            { childId: deleteConfirm.childId },
            { onSuccess: () => setDeleteConfirm(null) }
          );
        }}
      />
    </div>
  );
}
