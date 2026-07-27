import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

const devAuthBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

export default function SignInPage() {
  if (devAuthBypassEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-semibold mb-3">Dev auth bypass enabled</h1>
          <p className="text-muted-foreground mb-6">
            Clerk sign-in is skipped in local development so you can test
            policies, lockout, and extension approvals without parent auth.
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
    <div className="min-h-screen flex items-center justify-center">
      <SignIn />
    </div>
  );
}
