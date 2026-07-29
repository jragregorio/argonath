import Link from "next/link";
import { Shield } from "lucide-react";
import {
  DashboardPanel,
  LockPanel,
} from "@/components/marketing/product-panels";

const faqItems = [
  {
    q: "Does Warden work on Mac or phones?",
    a: "The parent dashboard works in any browser. Enforcement today is Windows-first via the Warden tray agent on the child’s PC.",
  },
  {
    q: "How does pairing work?",
    a: "From the dashboard, generate a short-lived pairing code for a child. Enter it in Warden.Tray on the PC — the device stays linked until you remove it.",
  },
  {
    q: "Does idle time count toward the limit?",
    a: "No. Warden tracks active use. After a stretch of idle time, the clock pauses so background apps don’t burn the day’s allowance.",
  },
  {
    q: "What happens when time runs out?",
    a: "A full-screen lock appears on the PC. Your child can request more time; you approve or deny from the dashboard. Parents can also unlock with a PIN when needed.",
  },
  {
    q: "Can kids just close or uninstall it?",
    a: "The agent is meant for supervised PCs. Admin unlock and Windows install habits still matter — Warden strengthens limits; it isn’t a substitute for device ownership.",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div className="home-glow absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-armor/40 blur-[120px]" />
        <div className="absolute right-0 top-[25%] h-[420px] w-[420px] rounded-full bg-secondary/50 blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 h-[360px] w-[360px] rounded-full bg-attention/12 blur-[90px]" />
        <div className="absolute right-1/3 top-[60%] h-[220px] w-[220px] rounded-full bg-plume/20 blur-[90px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.18) 1px, transparent 0)",
            backgroundSize: "28px 28px",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 40%, transparent 85%)",
          }}
        />
      </div>

      <header className="home-fade relative z-10 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="h-8 w-8 text-attention" aria-hidden="true" />
            <span className="font-display text-xl font-bold tracking-tight">
              Warden
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/sign-in"
              className="px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:px-4"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero — single composition */}
        <section className="relative flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center px-6 pb-20 pt-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="home-rise font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
              Parental screen time control, done right
            </h1>
            <p className="home-rise home-rise-delay-1 mx-auto mt-6 max-w-xl text-lg text-muted-foreground text-pretty sm:text-xl">
              Set daily limits and enforce them on your child&apos;s Windows PC —
              from one parent dashboard.
            </p>
            <div className="home-rise home-rise-delay-2 mt-10">
              <Link
                href="/sign-up"
                className="inline-block rounded-lg bg-primary px-8 py-3.5 text-lg font-medium text-primary-foreground transition-colors hover:bg-accent"
              >
                Start protecting your family
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-white/5 px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-attention/90">
              How it works
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              From dashboard to device in minutes
            </h2>
            <ol className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-8">
              {[
                {
                  step: "01",
                  title: "Create a family",
                  body: "Add children and set a daily screen-time limit for each device.",
                },
                {
                  step: "02",
                  title: "Install & pair",
                  body: "Install Warden.Tray on the PC and enter a pairing code from your dashboard.",
                },
                {
                  step: "03",
                  title: "Enforce automatically",
                  body: "Active use counts toward the limit. When time's up, the lock screen takes over.",
                },
              ].map((item) => (
                <li key={item.step} className="relative">
                  <span className="font-display text-4xl font-bold text-armor/40">
                    {item.step}
                  </span>
                  <h3 className="mt-3 font-display text-xl font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-muted-foreground text-pretty">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Product showcase */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-attention/90">
                Parents decide
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Limits that hold when the PC is in use
              </h2>
              <p className="mt-4 text-lg text-muted-foreground text-pretty">
                Approve extension requests, watch remaining time, and keep
                supervision in one place — while Windows enforcement happens on
                the device.
              </p>
            </div>
            <div className="mt-14 grid items-start gap-8 lg:grid-cols-2">
              <DashboardPanel />
              <LockPanel />
            </div>
            <p className="mt-6 max-w-xl text-sm text-muted-foreground text-pretty">
              When the day&apos;s allowance is gone, kids see a clear lock —
              and a way to ask for more time instead of arguing at the door.
            </p>
          </div>
        </section>

        {/* Split narrative */}
        <section className="border-t border-white/5 px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              You&apos;re in charge. They&apos;re not locked out of asking.
            </h2>
            <div className="mt-14 grid gap-16 md:grid-cols-2">
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight text-primary">
                  For parents
                </h3>
                <ul className="mt-5 space-y-4 text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-attention" />
                    <span>
                      Set daily limits and see how much time is left in real
                      time.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-attention" />
                    <span>
                      Approve or deny extension requests from your phone or
                      laptop.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-attention" />
                    <span>
                      Optional snapshots and nudges when you need a closer look.
                    </span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight text-primary">
                  For kids
                </h3>
                <ul className="mt-5 space-y-4 text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-attention" />
                    <span>
                      A clear daily limit — no surprise cutoffs mid-sentence.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-attention" />
                    <span>
                      Request more time when it matters; parents decide.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-attention" />
                    <span>
                      Idle time doesn&apos;t burn the clock — play and homework
                      stay fair.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Windows agent */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#1a2420] via-card to-[#283c3c] px-8 py-14 sm:px-12">
              <div
                className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-live/15 blur-3xl"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-plume/15 blur-3xl"
                aria-hidden="true"
              />
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-attention/90">
                Windows agent
              </p>
              <h2 className="mt-3 max-w-xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Built for Windows, not just the browser
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-muted-foreground text-pretty">
                Warden.Tray runs on the child&apos;s PC for system-wide
                enforcement — pairing with a short code, tracking active use,
                and locking the session when the day is done. Optional start
                with Windows keeps it ready after reboot.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-white/5 px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Questions parents ask
            </h2>
            <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
              {faqItems.map((item) => (
                <details key={item.q} name="faq" className="group py-5">
                  <summary className="cursor-pointer list-none font-display text-lg font-medium tracking-tight marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="flex items-start justify-between gap-4">
                      {item.q}
                      <span
                        className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                        aria-hidden="true"
                      >
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 pr-8 text-muted-foreground text-pretty">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 pb-28 pt-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Start protecting your family
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground text-pretty">
              Create a parent account, pair a Windows PC, and set the first
              daily limit in minutes.
            </p>
            <Link
              href="/sign-up"
              className="mt-8 inline-block rounded-lg bg-primary px-8 py-3.5 text-lg font-medium text-primary-foreground transition-colors hover:bg-accent"
            >
              Get started
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-attention" aria-hidden="true" />
            <span>Warden</span>
          </div>
          <p className="text-sm text-muted-foreground">Made by JRAG</p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/sign-in" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/sign-up" className="hover:text-foreground">
              Get started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
