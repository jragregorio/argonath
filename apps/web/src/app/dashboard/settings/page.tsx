"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";

function mutationErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
}

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: family } = trpc.family.get.useQuery();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [pin, setPin] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);

  useEffect(() => {
    if (me?.user) {
      setName(me.user.name);
      setEmail(me.user.email);
    }
  }, [me?.user]);

  useEffect(() => {
    if (family?.name) setFamilyName(family.name);
  }, [family?.name]);

  const updateName = trpc.auth.updateName.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });
  const updateEmail = trpc.auth.updateEmail.useMutation({
    onSuccess: () => {
      setEmailPassword("");
      utils.auth.me.invalidate();
    },
  });
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFormError(null);
    },
  });
  const renameFamily = trpc.family.rename.useMutation({
    onSuccess: () => {
      utils.family.get.invalidate();
      utils.auth.me.invalidate();
    },
  });
  const updatePin = trpc.family.updatePin.useMutation({
    onSuccess: () => setPin(""),
  });

  const isAdmin = me?.role === "Admin";

  return (
    <div className="space-y-8 max-w-xl">
      <PageHeader
        title="Settings"
        description="Account, family, and security settings"
      />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Update the name and email for your parent account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = name.trim();
              if (trimmed.length < 1) return;
              updateName.mutate({ name: trimmed });
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                maxLength={100}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={
                updateName.isPending ||
                name.trim().length < 1 ||
                name.trim() === me?.user.name
              }
            >
              {updateName.isPending ? "Saving…" : "Save name"}
            </Button>
            {updateName.isSuccess && (
              <p className="text-sm text-green-400">Name updated</p>
            )}
            {updateName.isError && (
              <p className="text-sm text-destructive">
                {mutationErrorMessage(updateName.error, "Could not update name")}
              </p>
            )}
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateEmail.mutate({
                email: email.trim(),
                currentPassword: emailPassword,
              });
            }}
            className="space-y-4 border-t border-border pt-6"
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="emailPassword">Current password</Label>
              <Input
                id="emailPassword"
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                className="mt-1"
                autoComplete="current-password"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={
                updateEmail.isPending ||
                !emailPassword ||
                email.trim().toLowerCase() === me?.user.email.toLowerCase()
              }
            >
              {updateEmail.isPending ? "Saving…" : "Update email"}
            </Button>
            {updateEmail.isSuccess && (
              <p className="text-sm text-green-400">Email updated</p>
            )}
            {updateEmail.isError && (
              <p className="text-sm text-destructive">
                {mutationErrorMessage(updateEmail.error, "Could not update email")}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Change your password. Other signed-in devices will be signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newPassword !== confirmPassword) {
                setPasswordFormError("New passwords do not match");
                return;
              }
              setPasswordFormError(null);
              changePassword.mutate({
                currentPassword,
                newPassword,
              });
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1"
                autoComplete="current-password"
                required
              />
            </div>
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={
                changePassword.isPending ||
                !currentPassword ||
                newPassword.length < 8
              }
            >
              {changePassword.isPending ? "Updating…" : "Change password"}
            </Button>
            {passwordFormError && (
              <p className="text-sm text-destructive">{passwordFormError}</p>
            )}
            {changePassword.isSuccess && (
              <p className="text-sm text-green-400">
                Password updated. Other devices have been signed out.
              </p>
            )}
            {changePassword.isError && (
              <p className="text-sm text-destructive">
                {mutationErrorMessage(
                  changePassword.error,
                  "Could not change password"
                )}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Family</CardTitle>
            <CardDescription>
              Rename the family shown in the dashboard sidebar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = familyName.trim();
                if (trimmed.length < 1) return;
                renameFamily.mutate({ name: trimmed });
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="familyName">Family name</Label>
                <Input
                  id="familyName"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  className="mt-1"
                  maxLength={100}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={
                  renameFamily.isPending ||
                  familyName.trim().length < 1 ||
                  familyName.trim() === family?.name
                }
              >
                {renameFamily.isPending ? "Saving…" : "Save family name"}
              </Button>
              {renameFamily.isSuccess && (
                <p className="text-sm text-green-400">Family name updated</p>
              )}
              {renameFamily.isError && (
                <p className="text-sm text-destructive">
                  {mutationErrorMessage(
                    renameFamily.error,
                    "Could not rename family"
                  )}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Parent PIN</CardTitle>
          <CardDescription>
            Required to exit the Windows agent from the tray menu or lock screen
            (&quot;Shut down Warden&quot;). Synced to agents on the next heartbeat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pin.length >= 4) updatePin.mutate({ pin });
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="pin">PIN (4–8 characters)</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={family?.parentPin ? "••••" : "Set a PIN"}
                className="mt-1"
                minLength={4}
                maxLength={8}
              />
            </div>
            <Button type="submit" disabled={updatePin.isPending || pin.length < 4}>
              {updatePin.isPending ? "Saving..." : "Save PIN"}
            </Button>
            {updatePin.isSuccess && (
              <p className="text-sm text-green-400">PIN updated successfully</p>
            )}
            {updatePin.isError && (
              <p className="text-sm text-destructive">
                {mutationErrorMessage(updatePin.error, "Could not update PIN")}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
