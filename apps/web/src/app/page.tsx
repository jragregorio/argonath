import Link from "next/link";
import { Shield } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            <span className="text-xl font-bold">Warden</span>
          </div>
          <div className="flex gap-4">
            <Link
              href="/sign-in"
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-accent transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <h1 className="text-5xl font-bold mb-6">
            Parental screen time control, done right
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Set limits, approve extension requests, and supervise your child&apos;s
            device — all from one dashboard. Powered by a Windows agent for
            system-wide enforcement.
          </p>
          <Link
            href="/sign-up"
            className="inline-block px-8 py-3 bg-primary text-primary-foreground rounded-lg text-lg font-medium hover:bg-accent transition-colors"
          >
            Start protecting your family
          </Link>
        </div>
      </main>
    </div>
  );
}
