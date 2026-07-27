import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

const devAuthBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

export default function SignUpPage() {
  if (devAuthBypassEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-semibold mb-3">Dev auth bypass enabled</h1>
          <p className="text-muted-foreground mb-6">
            Clerk sign-up is skipped in local development so you can focus on
            the Windows agent and policy flows first.
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
      <SignUp />
    </div>
  );
}
