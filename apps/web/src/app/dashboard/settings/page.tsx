"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { COMMON_TIME_ZONES } from "@warden/shared";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PageHeader } from "@/components/page-header";

function mutationErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
}

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: family } = trpc.family.get.useQuery();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [pin, setPin] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);

  const detectedTz = useMemo(() => browserTimeZone(), []);

  const timezoneOptions = useMemo(() => {
    const set = new Set<string>(COMMON_TIME_ZONES);
    if (family?.timezone) set.add(family.timezone);
    if (detectedTz) set.add(detectedTz);
    if (timezone) set.add(timezone);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [family?.timezone, detectedTz, timezone]);

  useEffect(() => {
    if (me?.user) {
      setName(me.user.name);
      setEmail(me.user.email);
    }
  }, [me?.user]);

  useEffect(() => {
    if (family?.name) setFamilyName(family.name);
    if (family?.timezone) setTimezone(family.timezone);
  }, [family?.name, family?.timezone]);

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
  const updateTimezone = trpc.family.updateTimezone.useMutation({
    onSuccess: () => {
      utils.family.get.invalidate();
      utils.policy.getEvaluation.invalidate();
      utils.dashboard.overview.invalidate();
    },
  });
  const updatePin = trpc.family.updatePin.useMutation({
    onSuccess: () => {
      setPin("");
      utils.family.get.invalidate();
    },
  });
  const updateNotificationPrefs = trpc.auth.updateNotificationPrefs.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });

  const isAdmin = me?.role === "Admin";

  return (
    <div className="space-y-8 max-w-5xl">
      <PageHeader
        title="Settings"
        description="Account, family, and security settings"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
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
              <PasswordInput
                id="emailPassword"
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
              <PasswordInput
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1"
                autoComplete="current-password"
                required
              />
            </div>
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <PasswordInput
                id="newPassword"
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
              <PasswordInput
                id="confirmPassword"
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
              Rename the family and set the timezone used for allowed hours and
              daily usage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
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

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!timezone) return;
                updateTimezone.mutate({ timezone });
              }}
              className="space-y-4 border-t border-border pt-6"
            >
              <div>
                <Label htmlFor="timezone">Time zone</Label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                      {detectedTz === tz ? " (this device)" : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Allowed hours (e.g. Thu 06:00–12:00) and “minutes used today”
                  use this zone, not the server clock.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={
                    updateTimezone.isPending ||
                    !timezone ||
                    timezone === family?.timezone
                  }
                >
                  {updateTimezone.isPending ? "Saving…" : "Save time zone"}
                </Button>
                {detectedTz && detectedTz !== timezone && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={updateTimezone.isPending}
                    onClick={() => setTimezone(detectedTz)}
                  >
                    Use {detectedTz}
                  </Button>
                )}
              </div>
              {updateTimezone.isSuccess && (
                <p className="text-sm text-green-400">Time zone updated</p>
              )}
              {updateTimezone.isError && (
                <p className="text-sm text-destructive">
                  {mutationErrorMessage(
                    updateTimezone.error,
                    "Could not update time zone"
                  )}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Choose which push alerts you receive on your phone
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              {
                key: "notifyExtensionRequests" as const,
                label: "Extension requests",
                description: "When a child asks for more screen time",
              },
              {
                key: "notifyDeviceOnline" as const,
                label: "Device online",
                description: "When a paired PC comes back online",
              },
              {
                key: "notifyDeviceOffline" as const,
                label: "Device offline",
                description: "When a paired PC stops checking in",
              },
            ] as const
          ).map(({ key, label, description }) => {
            const checked = me?.user?.[key] ?? true;
            return (
              <label
                key={key}
                className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border/70 bg-muted/10 px-3 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
                  checked={checked}
                  disabled={updateNotificationPrefs.isPending || !me?.user}
                  onChange={(e) => {
                    updateNotificationPrefs.mutate({ [key]: e.target.checked });
                  }}
                />
              </label>
            );
          })}
          {updateNotificationPrefs.isError && (
            <p className="text-sm text-destructive">
              {mutationErrorMessage(
                updateNotificationPrefs.error,
                "Could not update notification preferences"
              )}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Parent PIN
            {family?.hasParentPin ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400"
                title="PIN is set"
              >
                <Check className="w-3.5 h-3.5" />
                Set
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Not set
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Required to exit the Windows agent from the tray menu or lock screen
            (&quot;Shut down Warden&quot;). Synced to agents on the next heartbeat.
            {family?.hasParentPin
              ? " A PIN is active on paired devices — enter a new one below to change it."
              : " No PIN yet — set one so parents can shut down Warden on the device."}
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
              <PasswordInput
                id="pin"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={
                  family?.hasParentPin ? "Enter a new PIN to change it" : "Enter a PIN"
                }
                className="mt-1"
                minLength={4}
                maxLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={updatePin.isPending || pin.length < 4}>
              {updatePin.isPending
                ? "Saving..."
                : family?.hasParentPin
                  ? "Update PIN"
                  : "Set PIN"}
            </Button>
            {updatePin.isSuccess && (
              <p className="text-sm text-green-400">PIN saved successfully</p>
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
    </div>
  );
}
