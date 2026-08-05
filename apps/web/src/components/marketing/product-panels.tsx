/** Decorative product UI for the marketing homepage — not interactive. */

import type { ReactNode } from "react";
import { cn } from "@warden/ui";

export type ParentNudgeMockProps = {
  chip?: "none" | "waiting" | "seen";
  sending?: boolean;
};

export type ChildNudgeMockProps = {
  visible?: boolean;
  animate?: boolean;
  /** Remaining OK delay seconds; omit or 0 when ready / showing plain "OK". */
  okSeconds?: number;
  /** When true, OK is enabled (primary styling). */
  okEnabled?: boolean;
  /** Brief pressed state for the marketing click animation. */
  okPressed?: boolean;
};

export type DashboardExtensionPhase = "pending" | "focus" | "approved" | "empty";

export type DashboardPanelProps = {
  alexMinutesLeft?: number;
  alexBarPercent?: number;
  extensionPhase?: DashboardExtensionPhase;
  animate?: boolean;
  barTransitionMs?: number;
};

const DEFAULT_DASHBOARD: Required<
  Pick<
    DashboardPanelProps,
    "alexMinutesLeft" | "alexBarPercent" | "extensionPhase" | "animate"
  >
> = {
  alexMinutesLeft: 42,
  alexBarPercent: 35,
  extensionPhase: "pending",
  animate: false,
};

function formatMinutesLeft(minutes: number) {
  if (minutes <= 0) {
    return "0 min left";
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m left` : `${hours}h left`;
  }
  return `${minutes} min left`;
}

export function DashboardPanel({
  alexMinutesLeft = DEFAULT_DASHBOARD.alexMinutesLeft,
  alexBarPercent = DEFAULT_DASHBOARD.alexBarPercent,
  extensionPhase = DEFAULT_DASHBOARD.extensionPhase,
  animate = DEFAULT_DASHBOARD.animate,
  barTransitionMs,
}: DashboardPanelProps = {}) {
  const showExtensionRequest = extensionPhase !== "empty";

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      aria-hidden="true"
    >
      <div className="border-b border-border px-5 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Warden · Dashboard
        </span>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Children
          </p>
          <div className="rounded-lg bg-secondary/80 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Alex</p>
                <p className="text-xs text-muted-foreground">
                  PC · <span className="text-live">Online</span>
                </p>
              </div>
              <p
                className={cn(
                  "text-sm font-medium text-attention",
                  animate && "dashboard-preview-minutes"
                )}
              >
                {formatMinutesLeft(alexMinutesLeft)}
              </p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className={cn(
                  "h-full rounded-full bg-live",
                  animate && "dashboard-preview-bar"
                )}
                style={{
                  width: `${alexBarPercent}%`,
                  ...(barTransitionMs != null
                    ? { transitionDuration: `${barTransitionMs}ms` }
                    : {}),
                }}
              />
            </div>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-3 opacity-80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Sam</p>
                <p className="text-xs text-muted-foreground">Laptop · Idle</p>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                1h 10m left
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pending extensions
          </p>
          <div className="relative min-h-[8.25rem]">
            <div
              className={cn(
                "dashboard-preview-extension-layer rounded-lg border bg-attention/5 px-3 py-3 transition-opacity duration-500",
                showExtensionRequest
                  ? "border-attention/30 opacity-100"
                  : "pointer-events-none border-transparent opacity-0",
                animate &&
                  showExtensionRequest &&
                  extensionPhase === "pending" &&
                  "ring-1 ring-attention/20"
              )}
            >
              <p className="text-sm font-semibold text-foreground">
                Alex requests +15 min
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {extensionPhase === "approved"
                  ? "+15 min added"
                  : "Daily limit reached · waiting for your decision"}
              </p>
              <div className="mt-3 flex gap-2">
                <span
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-300",
                    extensionPhase === "approved"
                      ? "bg-live/15 text-live ring-1 ring-live/30"
                      : "bg-primary text-primary-foreground",
                    extensionPhase === "focus" &&
                      "ring-2 ring-attention/70 ring-offset-2 ring-offset-card"
                  )}
                >
                  {extensionPhase === "approved" ? "Approved" : "Approve"}
                </span>
                <span
                  className={cn(
                    "rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-opacity duration-300",
                    extensionPhase === "approved" && "opacity-40"
                  )}
                >
                  Deny
                </span>
              </div>
            </div>
            <div
              className={cn(
                "dashboard-preview-extension-layer absolute inset-0 flex items-center rounded-lg border border-border bg-secondary/40 px-3 py-3 transition-opacity duration-500",
                extensionPhase === "empty"
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              )}
            >
              <p className="text-sm text-muted-foreground">No pending requests</p>
            </div>
          </div>
          <div className="rounded-lg bg-secondary/60 px-3 py-3">
            <p className="text-sm text-muted-foreground">Today&apos;s usage</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              1h 18m
            </p>
            <p className="text-xs text-muted-foreground">of 2h daily limit</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export type LockPanelPhase =
  | "idle"
  | "request-focus"
  | "sent"
  | "waiting"
  | "approved"
  | "resuming";

export type LockPanelProps = {
  phase?: LockPanelPhase;
  animate?: boolean;
  /** Showcase child view: faux desktop + lock overlay. Default flat card. */
  variant?: "card" | "desktop";
};

function getDesktopOverlay(phase: LockPanelPhase) {
  switch (phase) {
    case "idle":
    case "request-focus":
    case "sent":
    case "waiting":
      return 1;
    case "approved":
      return 0.88;
    case "resuming":
      return 0;
  }
}

function LockPanelContent({
  phase,
  animate,
  ringOffsetClass,
}: {
  phase: LockPanelPhase;
  animate: boolean;
  ringOffsetClass: string;
}) {
  const requestLabel = phase === "sent" ? "Request sent!" : "Request +15 min";
  const subtitle =
    phase === "waiting"
      ? "Waiting for parent…"
      : phase === "approved" || phase === "resuming"
        ? "Approved — resuming…"
        : "Ask a parent for more time, or come back tomorrow.";
  const requestSent = phase === "sent";

  return (
    <>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-live/10 ring-1 ring-fel/35">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-live"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>
      <p className="font-display text-2xl font-semibold tracking-tight text-foreground">
        Time&apos;s up for today
      </p>
      <p
        className={cn(
          "mt-2 max-w-xs text-sm text-muted-foreground",
          animate && "lock-preview-subtitle"
        )}
      >
        {subtitle}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <span
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-all duration-300",
            requestSent
              ? "bg-live/15 text-live ring-1 ring-live/30"
              : "bg-primary text-primary-foreground",
            phase === "request-focus" &&
              cn("ring-2 ring-attention/70 ring-offset-2", ringOffsetClass),
            (phase === "approved" || phase === "resuming") && "opacity-50"
          )}
        >
          {requestLabel}
        </span>
        <span
          className={cn(
            "rounded-md border border-border bg-secondary/40 px-4 py-2 text-sm text-foreground transition-opacity duration-300",
            (requestSent ||
              phase === "waiting" ||
              phase === "approved" ||
              phase === "resuming") &&
              "opacity-40"
          )}
        >
          Shut down
        </span>
      </div>
      <p className="mt-8 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
        Warden · Windows agent
      </p>
    </>
  );
}

function FauxDesktopBackground() {
  return (
    <>
      <div
        className="absolute inset-0 lock-desktop-wallpaper"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-3 top-3 hidden h-[4.5rem] w-[5.5rem] rounded-md border border-white/10 bg-[#24302c]/75 shadow-md sm:left-4 sm:top-4 md:block md:h-20 md:w-32"
        aria-hidden="true"
      >
        <div className="border-b border-white/10 px-2 py-1">
          <div className="h-1 w-8 rounded-full bg-white/25" />
        </div>
        <div className="space-y-1.5 p-2">
          <div className="h-1 w-full rounded-full bg-white/15" />
          <div className="h-1 w-[80%] rounded-full bg-white/10" />
        </div>
      </div>
      <div
        className="absolute bottom-0 left-0 right-0 flex h-8 items-center justify-between border-t border-white/10 bg-[#141a18]/92 px-2 sm:h-9 sm:px-3"
        aria-hidden="true"
      >
        <div className="flex items-center gap-1 sm:gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-white/30 sm:h-2.5 sm:w-2.5" />
          <span className="hidden h-2 w-2 rounded-sm bg-white/20 sm:inline-block sm:h-2.5 sm:w-2.5" />
          <span className="hidden h-2 w-2 rounded-sm bg-white/20 md:inline-block md:h-2.5 md:w-2.5" />
        </div>
        <div className="h-1.5 w-10 rounded-full bg-white/20 sm:w-14" />
      </div>
    </>
  );
}

export function LockPanel({
  phase = "idle",
  animate = false,
  variant = "card",
}: LockPanelProps = {}) {
  if (variant === "desktop") {
    const overlayOpacity = getDesktopOverlay(phase);

    return (
      <div
        className="relative min-h-[280px] overflow-hidden rounded-xl border border-border shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        aria-hidden="true"
      >
        <FauxDesktopBackground />
        <div
          className={cn(
            "lock-preview-lock-overlay absolute inset-0 flex flex-col items-center justify-center bg-[#1a2420] px-6 py-10 text-center",
            animate && "lock-preview-lock-layer-animated"
          )}
          style={{ opacity: overlayOpacity }}
        >
          <LockPanelContent
            phase={phase}
            animate={animate}
            ringOffsetClass="ring-offset-[#1a2420]"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-[#1a2420] shadow-[0_24px_80px_rgba(0,0,0,0.5)]",
        animate && "lock-preview-panel"
      )}
      aria-hidden="true"
    >
      <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
        <LockPanelContent
          phase={phase}
          animate={animate}
          ringOffsetClass="ring-offset-[#1a2420]"
        />
      </div>
    </div>
  );
}

function TrayWindowShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#1a2420] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-2 border-b border-border bg-[#1a2420] px-3 py-2">
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-attention"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span className="text-xs text-foreground/90">{title}</span>
      </div>
      {children}
    </div>
  );
}

function formatTrayTimer(minutes: number, seconds: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return {
    hours: h.toString().padStart(2, "0"),
    minutes: m.toString().padStart(2, "0"),
    seconds: seconds.toString().padStart(2, "0"),
  };
}

export type TrayPanelProps = {
  pairingOpacity?: number;
  runningOpacity?: number;
  pairingCode?: string;
  pairingSuccess?: boolean;
  showPairingCaret?: boolean;
  pairButtonPressed?: boolean;
  childName?: string;
  timerMinutes?: number;
  timerSeconds?: number;
  usageBarPercent?: number;
  animate?: boolean;
  barTransitionMs?: number;
};

function TrayPairingScreen({
  pairingCode,
  pairingSuccess,
  showPairingCaret = false,
  pairButtonPressed = false,
  animate = false,
}: {
  pairingCode: string;
  pairingSuccess: boolean;
  showPairingCaret?: boolean;
  pairButtonPressed?: boolean;
  animate?: boolean;
}) {
  const slots = Array.from({ length: 6 }, (_, index) => {
    const digit = pairingCode[index];
    const isCaretSlot =
      showPairingCaret && index === pairingCode.length && pairingCode.length < 6;

    return (
      <span
        key={index}
        className={cn(
          "inline-block w-[1ch] text-center",
          digit ? "text-foreground" : "text-muted-foreground/45"
        )}
      >
        {isCaretSlot ? (
          <span
            className={cn(
              "text-foreground",
              animate && "tray-preview-pairing-caret"
            )}
          >
            |
          </span>
        ) : (
          digit ?? "·"
        )}
      </span>
    );
  });

  return (
    <TrayWindowShell title="Warden — Device Pairing">
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <p className="font-display text-lg font-semibold text-foreground">
            Warden Agent Setup
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the 6-digit code from the parent dashboard.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Pairing code</p>
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] text-foreground">
            {slots}
          </div>
        </div>
        <span
          className={cn(
            "block w-full rounded-[14px] bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground",
            animate && "tray-preview-pair-button",
            pairButtonPressed && "tray-preview-pair-button-pressed"
          )}
        >
          Pair Device
        </span>
        <p
          className={cn(
            "min-h-[1.25rem] text-center text-sm",
            pairingSuccess ? "text-live" : "text-muted-foreground"
          )}
        >
          {pairingSuccess ? "Paired successfully" : "\u00a0"}
        </p>
      </div>
    </TrayWindowShell>
  );
}

function TrayRunningScreen({
  childName,
  timerMinutes,
  timerSeconds,
  usageBarPercent,
  animate,
  barTransitionMs,
}: {
  childName: string;
  timerMinutes: number;
  timerSeconds: number;
  usageBarPercent: number;
  animate: boolean;
  barTransitionMs?: number;
}) {
  const timer = formatTrayTimer(timerMinutes, timerSeconds);

  return (
    <TrayWindowShell title="Warden">
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <p className="font-display text-xl font-bold text-foreground">Warden</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Watching {childName}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-foreground">Status</span>
            <span className="text-base font-semibold text-live">Running</span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-border bg-card">
          <div
            className={cn(
              "absolute inset-y-0 left-0 bg-live/20",
              animate && "tray-preview-usage-fill"
            )}
            style={{
              width: `${usageBarPercent}%`,
              ...(barTransitionMs != null
                ? { transitionDuration: `${barTransitionMs}ms` }
                : {}),
            }}
          />
          <div className="relative px-4 py-5 text-center">
            <p className="text-sm font-semibold text-muted-foreground">
              Time remaining
            </p>
            <div className="mt-2 flex items-center justify-center gap-1 font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              <span>{timer.hours}</span>
              <span className="text-muted-foreground">:</span>
              <span>{timer.minutes}</span>
              <span className="text-muted-foreground">:</span>
              <span>{timer.seconds}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Active use counts toward today&apos;s limit
            </p>
          </div>
        </div>
        <span className="block w-full rounded-[14px] bg-attention py-2.5 text-center text-sm font-semibold text-attention-foreground">
          Request
        </span>
      </div>
    </TrayWindowShell>
  );
}

/** Warden.Tray pairing + status window vignette for the Windows agent section. */
export function TrayPanel({
  pairingOpacity = 0,
  runningOpacity = 1,
  pairingCode = "",
  pairingSuccess = false,
  showPairingCaret = false,
  pairButtonPressed = false,
  childName = "Alex",
  timerMinutes = 42,
  timerSeconds = 0,
  usageBarPercent = 35,
  animate = false,
  barTransitionMs,
}: TrayPanelProps = {}) {
  return (
    <div
      className="relative mx-auto min-h-[26rem] w-full max-w-[19rem] sm:max-w-[21rem] sm:min-h-[27rem]"
      aria-hidden="true"
    >
      <div
        className={cn(
          "tray-preview-layer absolute inset-0",
          animate && "tray-preview-layer-animated"
        )}
        style={{ opacity: pairingOpacity }}
      >
        <TrayPairingScreen
          pairingCode={pairingCode}
          pairingSuccess={pairingSuccess}
          showPairingCaret={showPairingCaret}
          pairButtonPressed={pairButtonPressed}
          animate={animate}
        />
      </div>
      <div
        className={cn(
          "tray-preview-layer absolute inset-0",
          animate && "tray-preview-layer-animated"
        )}
        style={{ opacity: runningOpacity }}
      >
        <TrayRunningScreen
          childName={childName}
          timerMinutes={timerMinutes}
          timerSeconds={timerSeconds}
          usageBarPercent={usageBarPercent}
          animate={animate}
          barTransitionMs={barTransitionMs}
        />
      </div>
    </div>
  );
}

function MockBellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function MockChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Parent-side nudge control vignette for the marketing split section. */
export function ParentNudgeMock({
  chip = "waiting",
  sending = false,
}: ParentNudgeMockProps = {}) {
  return (
    <div
      className="origin-top scale-[0.88] pt-1 sm:scale-[0.9]"
      aria-hidden="true"
    >
      <div className="mx-auto w-full max-w-[17.5rem] rounded-xl border border-border bg-card/95 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Alex</p>
              <p className="text-xs text-muted-foreground">
                PC · <span className="text-live">Online</span>
              </p>
            </div>
            <span
              className={cn(
                "nudge-preview-chip shrink-0 rounded-md px-2 py-0.5 text-xs transition-all duration-500 ease-out",
                chip === "none" && "opacity-0",
                chip === "waiting" && "bg-secondary/80 text-muted-foreground opacity-100",
                chip === "seen" &&
                  "bg-live/10 text-live ring-1 ring-live/25 opacity-100"
              )}
            >
              {chip === "seen" ? "Seen" : "Waiting…"}
            </span>
          </div>
          <div className="inline-flex w-full min-w-0">
            <span
              className={cn(
                "inline-flex min-w-0 flex-1 items-center justify-center rounded-l-lg bg-attention px-3 py-2 text-sm font-medium text-attention-foreground transition-opacity duration-300",
                sending && "opacity-75"
              )}
            >
              {!sending && <MockBellIcon className="mr-1.5 h-4 w-4 shrink-0" />}
              {sending ? "Sending…" : "Nudge"}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-r-lg border-l border-attention-foreground/20 bg-attention px-2.5 py-2 text-attention-foreground transition-opacity duration-300",
                sending && "opacity-75"
              )}
            >
              <MockChevronDownIcon className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Child-side AttentionWindow vignette — matches agent nudge card styling. */
export function ChildNudgeMock({
  visible = true,
  animate = false,
  okSeconds = 3,
  okEnabled = false,
  okPressed = false,
}: ChildNudgeMockProps = {}) {
  const okLabel =
    okEnabled || okSeconds <= 0 ? "OK" : `OK (${okSeconds})`;

  return (
    <div
      className={cn(
        "origin-top scale-[0.88] pt-1 sm:scale-[0.9]",
        animate && "nudge-preview-child",
        animate && (visible ? "nudge-preview-child-visible" : "nudge-preview-child-hidden")
      )}
      aria-hidden="true"
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[17.5rem] rounded-xl border border-border bg-card px-6 py-5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]",
          animate && visible && "nudge-preview-child-glow"
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          NUDGE
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug text-foreground">
          Dinner time
        </p>
        <span
          className={cn(
            "mt-5 block w-full rounded-[14px] px-4 py-3 text-center text-sm font-semibold",
            animate && "nudge-preview-ok-button",
            okEnabled
              ? "bg-primary text-primary-foreground"
              : "bg-border text-muted-foreground opacity-55",
            okPressed && "nudge-preview-ok-button-pressed"
          )}
        >
          {okLabel}
        </span>
      </div>
    </div>
  );
}
