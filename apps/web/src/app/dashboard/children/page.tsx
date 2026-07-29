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
import { POLL_SAFETY_MS } from "@/lib/query-defaults";

export default function ChildrenPage() {
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const utils = trpc.useUtils();
  const { data: children, isLoading } = trpc.children.list.useQuery(undefined, {
    // Covered by lock / policy / extension / device:online Realtime events
    refetchInterval: POLL_SAFETY_MS,
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
          {children.map((child) => (
            <Card key={child.id}>
              <CardHeader>
                {editingId === child.id ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
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
                      onClick={() => {
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
                    href={`/dashboard/children/${child.id}`}
                    className="text-primary hover:underline text-sm"
                  >
                    Manage profile →
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteChild.isPending}
                    onClick={() => {
                      const ok = window.confirm(
                        `Delete ${child.displayName} and ${child.devices.length} connected device${child.devices.length === 1 ? "" : "s"}? This cannot be undone.`
                      );
                      if (ok) deleteChild.mutate({ childId: child.id });
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No children added yet. Add your first child to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
