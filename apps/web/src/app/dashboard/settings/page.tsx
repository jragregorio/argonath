"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  const [pin, setPin] = useState("");
  const { data: family } = trpc.family.getOrCreate.useQuery();
  const updatePin = trpc.family.updatePin.useMutation({
    onSuccess: () => setPin(""),
  });

  return (
    <div className="space-y-8 max-w-lg">
      <PageHeader
        title="Settings"
        description="Family and security settings"
      />

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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
