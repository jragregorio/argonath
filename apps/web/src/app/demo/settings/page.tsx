"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DemoSettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Account and family preferences (preview only)"
      />

      <div className="rounded-lg border border-border/60 bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        Settings are read-only in the demo. Create an account to manage your
        family name, time zone, parent PIN, and notifications.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Family</CardTitle>
          <CardDescription>Demo household — not editable</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="demo-family-name">Family name</Label>
            <Input
              id="demo-family-name"
              value="The Demo Family"
              readOnly
              disabled
              className="max-w-md"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-timezone">Time zone</Label>
            <Input
              id="demo-timezone"
              value="America/Los_Angeles"
              readOnly
              disabled
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Sign up to save your real family</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="inline-flex min-h-14 items-center justify-center rounded-lg bg-attention px-4 py-2.5 text-sm font-medium text-attention-foreground transition-colors hover:opacity-90 md:min-h-11"
          >
            Create free account
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex min-h-14 items-center justify-center rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary md:min-h-11"
          >
            Sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
