/** Shared React Query / polling defaults for the parent dashboard. */

export const QUERY_STALE_TIME_MS = 30_000;

/**
 * Agent heartbeats write usage / lastSeen often; pages that display those
 * values poll at this cadence when Realtime does not cover every write.
 */
export const POLL_HEARTBEAT_MS = 30_000;

/**
 * Faster cadence while something is in-flight (e.g. pending captures).
 * Prefer Realtime invalidation for settled data.
 */
export const POLL_LIVE_MS = 60_000;

/**
 * Device list / online freshness. `device:offline` is never broadcast, so this
 * cannot be dropped entirely; Realtime covers `device:online` + lock events.
 */
export const POLL_BACKGROUND_MS = 120_000;

/**
 * Safety net when Realtime may have dropped. Event-driven invalidation is primary.
 */
export const POLL_SAFETY_MS = 240_000;
