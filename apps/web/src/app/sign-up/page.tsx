"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

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
      <AuthShell
        title="Dev auth bypass"
        subtitle="Sign-up is skipped in local development. Open the dashboard directly."
        footer={
          <>
            Prefer production auth? Set{" "}
            <code className="text-xs">NEXT_PUBLIC_DEV_AUTH_BYPASS</code> off.
          </>
        }
      >
        <Link
          href="/dashboard"
          className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent"
        >
          Open dashboard
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up Warden for your family and start protecting screen time."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            required
            autoComplete="name"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="familyName">Family name (optional)</Label>
          <Input
            id="familyName"
            autoComplete="organization"
            placeholder="e.g. The Gregorio family"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">At least 8 characters</p>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
