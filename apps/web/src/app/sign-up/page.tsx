"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const devAuthBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          familyName: familyName.trim() || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign-up failed");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Sign-up failed");
    } finally {
      setPending(false);
    }
  }

  if (devAuthBypassEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-semibold mb-3">Dev auth bypass enabled</h1>
          <p className="text-muted-foreground mb-6">
            Sign-up is skipped in local development. Open the dashboard directly.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          >
            Open dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-border bg-card p-8 space-y-4"
      >
        <div className="space-y-1 mb-2">
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="text-sm text-muted-foreground">
            Set up Warden for your family
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="familyName">Family name (optional)</Label>
          <Input
            id="familyName"
            autoComplete="organization"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters</p>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-sm text-muted-foreground text-center">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
