/** Decorative product UI for the marketing homepage — not interactive. */

export function DashboardPanel() {
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
              <p className="text-sm font-medium text-attention">42 min left</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full w-[35%] rounded-full bg-live" />
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
          <div className="rounded-lg border border-attention/30 bg-attention/5 px-3 py-3">
            <p className="text-sm font-semibold text-foreground">
              Alex requests +15 min
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Daily limit reached · waiting for your decision
            </p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                Approve
              </span>
              <span className="rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
                Deny
              </span>
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

export function LockPanel() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-[#1a2420] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
      aria-hidden="true"
    >
      <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
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
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Ask a parent for more time, or come back tomorrow.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Request +15 min
          </span>
          <span className="rounded-md border border-border bg-secondary/40 px-4 py-2 text-sm text-foreground">
            Shut down
          </span>
        </div>
        <p className="mt-8 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
          Warden · Windows agent
        </p>
      </div>
    </div>
  );
}
