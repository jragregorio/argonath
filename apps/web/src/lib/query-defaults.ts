/** Shared React Query / polling defaults for the parent dashboard. */
export const QUERY_STALE_TIME_MS = 30_000;

/** Live-ish data (overview, badges, child status) — realtime still invalidates sooner. */
export const POLL_LIVE_MS = 30_000;

/** Background lists / history / device id refresh. */
export const POLL_BACKGROUND_MS = 60_000;
