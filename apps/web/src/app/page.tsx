import Link from "next/link";
import { Shield } from "lucide-react";
import { AnimatedDashboardPanel } from "@/components/marketing/dashboard-preview-motion";
import { AnimatedTrayPreview } from "@/components/marketing/tray-preview-motion";
import { AnimatedShowcasePanels } from "@/components/marketing/showcase-preview-motion";
import {
  AnimatedChildNudgeMock,
  AnimatedParentNudgeMock,
  NudgePreviewProvider,
} from "@/components/marketing/nudge-preview-motion";
import {
  HomeSmoothScroll,
  StickyHomeCard,
  stickyCardStageClassName,
} from "@/components/marketing/home-smooth-scroll";
import {
  FramedStage,
  GoldEyebrow,
  MarketingAtmosphere,
} from "@/components/marketing/atmosphere";

const faqItems = [
  {
    q: "Does Warden work on Mac or phones?",
    a: "The parent dashboard is fully usable in any browser — 100% of features on the web. We also have a working Android app in beta; push notifications are the main advantage, so you’re alerted when your child needs you. Child-PC enforcement is still Windows-first via the Warden app.",
  },
  {
    q: "How does pairing work?",
    a: "Install Warden on your child’s PC with our working beta installer. From the dashboard, generate a short-lived pairing code for that child and enter it in the Warden app — the device stays linked until you remove it.",
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
    <HomeSmoothScroll>
      <div className="relative min-h-screen bg-background">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
        >
          <div className="home-glow absolute -left-24 top-0 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[120px]" />
          <div className="absolute right-0 top-[30%] h-[360px] w-[360px] rounded-full bg-attention/10 blur-[100px]" />
          <div className="absolute bottom-0 left-1/3 h-[280px] w-[280px] rounded-full bg-plume/20 blur-[90px]" />
        </div>

        <header className="home-fade sticky top-0 z-[100] border-b border-border/60 bg-background/85 px-4 py-5 backdrop-blur-md sm:px-6">
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
          {/* Hero — scrolls away; sticky stack begins below */}
          <section className="relative z-0 flex min-h-[calc(100dvh-4.5rem)] flex-col justify-center px-4 py-8 sm:px-6 md:px-8">
            <FramedStage className="mx-auto grid w-full max-w-6xl overflow-hidden md:min-h-[34rem] md:grid-cols-2">
              <div className="relative flex min-h-[18rem] flex-col justify-between overflow-hidden p-6 sm:min-h-[20rem] sm:p-8 md:min-h-0 md:p-10 lg:p-12">
                <MarketingAtmosphere />
                <GoldEyebrow className="relative z-10 home-fade">
                  Warden
                </GoldEyebrow>
                <div className="relative z-10 mt-8 max-w-md space-y-5 md:mt-0 md:space-y-6">
                  <h1 className="home-rise font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl lg:text-5xl">
                    Protect what matters most
                  </h1>
                  <p className="home-rise home-rise-delay-1 text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg">
                    Set daily limits and enforce them on your child&apos;s Windows
                    PC — from one parent dashboard.
                  </p>
                  <div className="home-rise home-rise-delay-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                      href="/demo"
                      className="inline-flex justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent sm:px-7 sm:py-3.5 sm:text-base"
                    >
                      Try demo now
                    </Link>
                    <Link
                      href="/sign-up"
                      className="inline-flex justify-center rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:px-7 sm:py-3.5 sm:text-base"
                    >
                      Create free account
                    </Link>
                  </div>
                </div>
              </div>

              <div className="relative flex flex-col justify-center border-t border-border bg-card/80 p-5 sm:p-8 md:border-t-0 md:border-l md:p-10">
                <div className="home-rise home-rise-delay-3">
                  <AnimatedDashboardPanel />
                </div>
              </div>
            </FramedStage>
          </section>

          {/* How it works */}
          <StickyHomeCard zIndex={10}>
            <FramedStage className={stickyCardStageClassName}>
              <div className="relative overflow-hidden px-6 py-8 sm:px-10 sm:py-10 md:py-14">
                <MarketingAtmosphere className="opacity-90" />
                <div className="relative z-10">
                  <GoldEyebrow>How it works</GoldEyebrow>
                  <h2 className="mt-5 max-w-xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                    From dashboard to device in minutes
                  </h2>
                  <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
                    {[
                      {
                        step: "01",
                        title: "Create a family",
                        body: "Add children and set a daily screen-time limit for each device.",
                      },
                      {
                        step: "02",
                        title: "Install & pair",
                        body: "Install the Warden app on the PC and enter a pairing code from your dashboard.",
                      },
                      {
                        step: "03",
                        title: "Enforce automatically",
                        body: "Active use counts toward the limit. When time's up, the lock screen takes over.",
                      },
                    ].map((item) => (
                      <li key={item.step}>
                        <span className="font-display text-sm font-semibold tracking-[0.18em] text-attention">
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
              </div>
            </FramedStage>
          </StickyHomeCard>

          {/* Parents decide */}
          <StickyHomeCard zIndex={20}>
            <FramedStage className={stickyCardStageClassName}>
              <div className="relative overflow-hidden px-6 py-8 sm:px-10 sm:py-10 md:py-14">
                <MarketingAtmosphere insetClassName="opacity-70" />
                <div className="relative z-10">
                  <div className="max-w-2xl">
                    <GoldEyebrow>Parents decide</GoldEyebrow>
                    <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                      Limits that hold when the PC is in use
                    </h2>
                    <p className="mt-4 text-lg text-muted-foreground text-pretty">
                      Approve extension requests, watch remaining time, and keep
                      supervision in one place — while Windows enforcement happens
                      on the device.
                    </p>
                  </div>
                  <AnimatedShowcasePanels />
                  <p className="mt-6 max-w-xl text-sm text-muted-foreground text-pretty">
                    When the day&apos;s allowance is gone, kids see a clear lock —
                    and a way to ask for more time instead of arguing at the door.
                  </p>
                </div>
              </div>
            </FramedStage>
          </StickyHomeCard>

          {/* For parents / for kids */}
          <StickyHomeCard zIndex={30}>
            <NudgePreviewProvider>
              <FramedStage
                className={`${stickyCardStageClassName} grid md:grid-cols-2`}
              >
                <div className="relative overflow-hidden border-b border-border p-6 sm:p-8 md:border-b-0 md:border-r md:p-10">
                  <MarketingAtmosphere />
                  <div className="relative z-10">
                    <GoldEyebrow>For parents</GoldEyebrow>
                    <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                      You&apos;re in charge
                    </h2>
                    <ul className="mt-8 space-y-4 text-muted-foreground">
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
                          Optional snapshots and nudges when you need a closer
                          look.
                        </span>
                      </li>
                    </ul>
                    <div className="mt-8 overflow-visible pb-2">
                      <AnimatedParentNudgeMock />
                    </div>
                  </div>
                </div>
                <div className="relative overflow-hidden p-6 sm:p-8 md:p-10">
                  <div
                    className="pointer-events-none absolute inset-0 bg-card"
                    aria-hidden="true"
                  />
                  <div className="relative z-10">
                    <GoldEyebrow>For kids</GoldEyebrow>
                    <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                      Still able to ask
                    </h2>
                    <ul className="mt-8 space-y-4 text-muted-foreground">
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
                    <div className="mt-8 overflow-visible pb-2">
                      <AnimatedChildNudgeMock />
                    </div>
                  </div>
                </div>
              </FramedStage>
            </NudgePreviewProvider>
          </StickyHomeCard>

          {/* Windows agent */}
          <StickyHomeCard zIndex={40}>
            <FramedStage className={`relative ${stickyCardStageClassName}`}>
              <MarketingAtmosphere />
              <div className="relative z-10 grid items-center gap-8 px-6 py-8 sm:px-10 sm:py-10 md:grid-cols-2 md:gap-8 md:py-14 lg:gap-12">
                <div>
                  <GoldEyebrow>Windows agent</GoldEyebrow>
                  <h2 className="mt-5 max-w-xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                    Built for Windows, not just the browser
                  </h2>
                  <p className="mt-4 max-w-xl text-lg text-muted-foreground text-pretty">
                    The Warden app runs on the child&apos;s PC for system-wide
                    enforcement — pairing with a short code, tracking active use,
                    and locking the session when the day is done. Optional start
                    with Windows keeps it ready after reboot.
                  </p>
                </div>
                <AnimatedTrayPreview />
              </div>
            </FramedStage>
          </StickyHomeCard>

          {/* FAQ */}
          <StickyHomeCard zIndex={50}>
            <FramedStage
              className={`${stickyCardStageClassName} mx-auto max-w-3xl`}
            >
              <div className="px-6 py-10 sm:px-10 sm:py-12">
                <GoldEyebrow>FAQ</GoldEyebrow>
                <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Questions parents ask
                </h2>
                <div className="mt-8 divide-y divide-border border-y border-border">
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
            </FramedStage>
          </StickyHomeCard>

          {/* Get started */}
          <StickyHomeCard zIndex={60}>
            <FramedStage
              className={`relative ${stickyCardStageClassName} mx-auto max-w-3xl`}
            >
              <MarketingAtmosphere />
              <div className="relative z-10 px-6 py-12 text-center sm:px-10 sm:py-14">
                <GoldEyebrow className="inline-flex flex-col items-center">
                  Get started
                </GoldEyebrow>
                <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  Start protecting your family
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-muted-foreground text-pretty">
                  Create a parent account, pair a Windows PC, and set the first
                  daily limit in minutes.
                </p>
                <Link
                  href="/sign-up"
                  className="mt-8 inline-flex rounded-lg bg-primary px-8 py-3.5 text-lg font-medium text-primary-foreground transition-colors hover:bg-accent"
                >
                  Get started
                </Link>
              </div>
            </FramedStage>
          </StickyHomeCard>
        </main>

        <footer className="relative z-[70] border-t border-border bg-background px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-x-2 text-xs sm:gap-x-4 sm:text-sm">
            <div className="flex items-center gap-1.5 justify-self-start text-muted-foreground sm:gap-2">
              <Shield
                className="h-3.5 w-3.5 shrink-0 text-attention sm:h-4 sm:w-4"
                aria-hidden="true"
              />
              <span className="truncate">Warden</span>
            </div>
            <p className="whitespace-nowrap text-center text-muted-foreground">
              Made by JRAG
            </p>
            <div className="flex items-center justify-end gap-3 justify-self-end text-muted-foreground sm:gap-6">
              <Link href="/sign-in" className="whitespace-nowrap hover:text-foreground">
                Sign in
              </Link>
              <Link href="/sign-up" className="whitespace-nowrap hover:text-foreground">
                Get started
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </HomeSmoothScroll>
  );
}
