/** Decorative product UI for the marketing homepage — not interactive. */

export function DashboardPanel() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111827] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      aria-hidden="true"
    >
      <div className="border-b border-white/10 px-5 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Warden · Dashboard
        </span>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Children
          </p>
          <div className="rounded-lg bg-slate-800/80 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Alex</p>
                <p className="text-xs text-slate-400">PC · Online</p>
              </div>
              <p className="text-sm font-medium text-sky-300">42 min left</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full w-[35%] rounded-full bg-sky-400" />
            </div>
          </div>
          <div className="rounded-lg bg-slate-800/40 px-3 py-3 opacity-70">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Sam</p>
                <p className="text-xs text-slate-400">Laptop · Idle</p>
              </div>
              <p className="text-sm font-medium text-slate-300">1h 10m left</p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Pending extensions
          </p>
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-3">
            <p className="text-sm font-semibold text-white">Alex requests +15 min</p>
            <p className="mt-1 text-xs text-slate-400">
              Daily limit reached · waiting for your decision
            </p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white">
                Approve
              </span>
              <span className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200">
                Deny
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-slate-800/50 px-3 py-3">
            <p className="text-sm text-slate-300">Today&apos;s usage</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white">
              1h 18m
            </p>
            <p className="text-xs text-slate-500">of 2h daily limit</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LockPanel() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 bg-[#020617] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
      aria-hidden="true"
    >
      <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/15 ring-1 ring-sky-400/30">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 text-sky-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <p className="font-display text-2xl font-semibold tracking-tight text-white">
          Time&apos;s up for today
        </p>
        <p className="mt-2 max-w-xs text-sm text-slate-400">
          Ask a parent for more time, or come back tomorrow.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white">
            Request +15 min
          </span>
          <span className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300">
            Shut down
          </span>
        </div>
        <p className="mt-8 text-[11px] uppercase tracking-[0.2em] text-slate-600">
          Warden · Windows agent
        </p>
      </div>
    </div>
  );
}
