"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ChildrenListSkeleton } from "@/components/dashboard-skeletons";
import { getDeviceDisplayName } from "@warden/shared";
import { Pencil, Plus, Trash2, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@warden/ui";
import { POLL_HEARTBEAT_MS } from "@/lib/query-defaults";
import { ConfirmDialog } from "@/components/confirm-dialog";

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
  const utils = trpc.useUtils();
  const { data: children, isLoading } = trpc.children.list.useQuery(undefined, {
    // Online badges / usage follow heartbeats; Realtime covers lock/policy/extension
    refetchInterval: POLL_HEARTBEAT_MS,
  });
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((child) => {
            const isEditing = editingId === child.id;
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
                    <User className="w-5 h-5" />
                    <span className="truncate">{child.displayName}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 ml-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setEditingId(child.id);
                        setEditName(child.displayName);
                      }}
                      title="Rename"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </CardTitle>
                )}
                <CardDescription>
                  {child.devices.length} device(s) paired
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
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
                    className="text-primary hover:underline text-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Manage profile →
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteChild.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDeleteConfirm({
                        childId: child.id,
                        displayName: child.displayName,
                        deviceCount: child.devices.length,
                      });
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
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
