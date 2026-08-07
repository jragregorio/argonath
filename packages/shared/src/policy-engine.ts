import type {
  AllowedWindow,
  ExtensionOverrideInput,
  LimitingFactor,
  PolicyEvaluation,
  PolicyReach,
  PolicyStatus,
  ScreenTimePolicyInput,
} from "./types";
import { DEFAULT_TIME_ZONE, getZonedTimeParts } from "./timezone";

function parseTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Per day, sort by start and merge overlapping and adjacent runs.
 * Does not merge across different days.
 */
export function mergeWindows(windows: AllowedWindow[]): AllowedWindow[] {
  const byDay = new Map<number, AllowedWindow[]>();
  for (const window of windows) {
    const list = byDay.get(window.day) ?? [];
    list.push(window);
    byDay.set(window.day, list);
  }

  const result: AllowedWindow[] = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const sorted = [...(byDay.get(day) ?? [])].sort(
      (a, b) => parseTime(a.start) - parseTime(b.start)
    );
    const merged: AllowedWindow[] = [];
    for (const window of sorted) {
      const start = parseTime(window.start);
      const end = parseTime(window.end);
      if (merged.length === 0) {
        merged.push({ day, start: window.start, end: window.end });
        continue;
      }
      const last = merged[merged.length - 1];
      const lastEnd = parseTime(last.end);
      // Overlapping or adjacent (start === lastEnd) → one run
      if (start <= lastEnd) {
        if (end > lastEnd) {
          last.end = formatMinutes(end);
        }
      } else {
        merged.push({ day, start: window.start, end: window.end });
      }
    }
    result.push(...merged);
  }
  return result;
}

/** Total merged window minutes for one weekday (0 if none). */
export function getWindowCapacityMinutes(
  windows: AllowedWindow[],
  day: number
): number {
  return mergeWindows(windows)
    .filter((w) => w.day === day)
    .reduce((sum, w) => sum + (parseTime(w.end) - parseTime(w.start)), 0);
}

/**
 * Per-weekday capacity vs daily limit for the parent advisory.
 * Computes from policy fields only (no usage / now).
 */
export function getPolicyReach(
  policy: Pick<ScreenTimePolicyInput, "dailyLimitMinutes" | "allowedWindows">
): PolicyReach {
  const { dailyLimitMinutes, allowedWindows } = policy;
  const hasAnyWindows = allowedWindows.length > 0;
  const byDay: PolicyReach["byDay"] = [];
  const constrainedDays: number[] = [];
  let minWindowedCapacityMinutes: number | null = null;

  for (let day = 1; day <= 7; day++) {
    const capacityMinutes = getWindowCapacityMinutes(allowedWindows, day);
    const hasWindowsForDay = allowedWindows.some((w) => w.day === day);
    const constrained =
      hasWindowsForDay && capacityMinutes < dailyLimitMinutes;
    byDay.push({ day, capacityMinutes, constrained });
    if (constrained) constrainedDays.push(day);
    if (hasWindowsForDay) {
      minWindowedCapacityMinutes =
        minWindowedCapacityMinutes === null
          ? capacityMinutes
          : Math.min(minWindowedCapacityMinutes, capacityMinutes);
    }
  }

  if (!hasAnyWindows) {
    minWindowedCapacityMinutes = null;
  }

  return {
    dailyLimitMinutes,
    byDay,
    constrainedDays,
    minWindowedCapacityMinutes,
  };
}

type WindowState = {
  inWindow: boolean;
  nextStart?: string;
  /** End minute of the current merged run (only when inWindow and windows non-empty). */
  windowEndMinutes?: number;
};

function resolveWindowState(
  windows: AllowedWindow[],
  now: Date,
  timeZone: string
): WindowState {
  if (windows.length === 0) {
    return { inWindow: true };
  }

  const { dayOfWeek: currentDay, minutesSinceMidnight: currentMinutes } =
    getZonedTimeParts(now, timeZone);

  const merged = mergeWindows(windows);
  const todayMerged = merged.filter((w) => w.day === currentDay);

  for (const window of todayMerged) {
    const start = parseTime(window.start);
    const end = parseTime(window.end);
    if (currentMinutes >= start && currentMinutes < end) {
      return { inWindow: true, windowEndMinutes: end };
    }
  }

  for (const window of merged) {
    const start = parseTime(window.start);
    if (
      window.day > currentDay ||
      (window.day === currentDay && start > currentMinutes)
    ) {
      return {
        inWindow: false,
        nextStart: `${DAY_NAMES[window.day]} ${window.start}`,
      };
    }
  }

  if (merged.length > 0) {
    const first = merged[0];
    return {
      inWindow: false,
      nextStart: `${DAY_NAMES[first.day]} ${first.start}`,
    };
  }

  return { inWindow: false };
}

function getActiveBonusMinutes(
  overrides: ExtensionOverrideInput[],
  now: Date
): number {
  return overrides
    .filter((o) => o.expiresAt > now)
    .reduce((sum, o) => sum + o.extraMinutes, 0);
}

/**
 * End minute (family TZ wall clock) of the latest merged window run that has
 * already ended today. Null when not applicable: no windows, still in window,
 * before first window today, or no ended run today.
 */
export function getLatestTodayWindowEndMinutes(
  windows: AllowedWindow[],
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): number | null {
  if (windows.length === 0) return null;

  const { dayOfWeek: currentDay, minutesSinceMidnight: currentMinutes } =
    getZonedTimeParts(now, timeZone);

  const todayMerged = mergeWindows(windows).filter((w) => w.day === currentDay);
  if (todayMerged.length === 0) return null;

  for (const window of todayMerged) {
    const start = parseTime(window.start);
    const end = parseTime(window.end);
    if (currentMinutes >= start && currentMinutes < end) {
      return null;
    }
  }

  let latestEnd: number | null = null;
  for (const window of todayMerged) {
    const end = parseTime(window.end);
    if (end <= currentMinutes) {
      latestEnd = latestEnd === null ? end : Math.max(latestEnd, end);
    }
  }

  return latestEnd;
}

/**
 * When currently outside today's allowed windows, minutes elapsed since the
 * latest merged window run ended today (family TZ wall clock). Null when not
 * applicable: no windows, still in window, before first window today, or no
 * ended run today.
 */
export function getMinutesSinceTodayWindowEnded(
  windows: AllowedWindow[],
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): number | null {
  const latestEnd = getLatestTodayWindowEndMinutes(windows, now, timeZone);
  if (latestEnd === null) return null;

  const { minutesSinceMidnight: currentMinutes } = getZonedTimeParts(now, timeZone);
  return currentMinutes - latestEnd;
}

/**
 * True when `grantCreatedAt` is strictly after today's window end instant
 * (family TZ), using `now` to determine today's calendar date and ended runs.
 */
export function isGrantCreatedAfterTodayWindowEnd(
  windows: AllowedWindow[],
  grantCreatedAt: Date,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): boolean {
  const windowEndMinute = getLatestTodayWindowEndMinutes(windows, now, timeZone);
  if (windowEndMinute === null) return false;

  const todayParts = getZonedTimeParts(now, timeZone);
  const createdParts = getZonedTimeParts(grantCreatedAt, timeZone);

  const todayKey =
    todayParts.year * 10000 + todayParts.month * 100 + todayParts.day;
  const createdKey =
    createdParts.year * 10000 + createdParts.month * 100 + createdParts.day;

  if (createdKey < todayKey) return false;
  if (createdKey > todayKey) return true;

  return createdParts.minutesSinceMidnight > windowEndMinute;
}

/**
 * Minutes after window end before treating the first server observation as "late"
 * and backfilling from wall-clock (vs pierce-at-current-used).
 */
export const LATE_OUTSIDE_BASELINE_MINUTES = 2;

/**
 * Wall-clock backfill from today's window end and usage.
 * **Late-repair / migration only** — not steady-state agent sync. Steady-state
 * baselines come from pierce-at-first-observe or persisted server values via
 * {@link resolveOutsideGrantBaselineToPersist}.
 *
 * Clamped so consumed after-hours time cannot exceed the bonus grant.
 */
export function computeIdealOutsideGrantBaseline(args: {
  usedMinutes: number;
  bonusMinutes: number;
  dailyLimitMinutes: number;
  minutesSinceWindowEnded: number | null;
}): number {
  const {
    usedMinutes,
    bonusMinutes,
    dailyLimitMinutes,
    minutesSinceWindowEnded,
  } = args;
  const backfill = minutesSinceWindowEnded ?? 0;
  const grantAtPierce = getOutsideExtensionRemainingMinutes({
    bonusMinutes,
    usedMinutesToday: usedMinutes,
    dailyLimitMinutes,
    baselineUsedMinutes: null,
  });
  const minBaseline = Math.max(0, usedMinutes - grantAtPierce);
  return Math.max(0, usedMinutes - backfill, minBaseline);
}

/**
 * Baseline to persist on the server for after-hours extension countdown.
 * Single source of truth for first-write and downward repair. Post-window stored
 * baselines are immutable once set; null stored pierces at current used.
 */
export function resolveOutsideGrantBaselineToPersist(args: {
  usedMinutes: number;
  bonusMinutes: number;
  dailyLimitMinutes: number;
  minutesSinceWindowEnded: number | null;
  storedBaseline: number | null;
  /** Active grant was approved strictly after today's window ended (family TZ). */
  grantCreatedAfterWindowEnd: boolean;
}): number {
  const {
    usedMinutes,
    bonusMinutes,
    dailyLimitMinutes,
    minutesSinceWindowEnded,
    storedBaseline,
    grantCreatedAfterWindowEnd,
  } = args;

  const ideal = computeIdealOutsideGrantBaseline({
    usedMinutes,
    bonusMinutes,
    dailyLimitMinutes,
    minutesSinceWindowEnded,
  });

  if (storedBaseline != null) {
    if (grantCreatedAfterWindowEnd) {
      return storedBaseline;
    }
    return Math.min(storedBaseline, ideal);
  }

  if (grantCreatedAfterWindowEnd) {
    return usedMinutes;
  }

  if (
    minutesSinceWindowEnded != null &&
    minutesSinceWindowEnded >= LATE_OUTSIDE_BASELINE_MINUTES
  ) {
    return ideal;
  }

  return usedMinutes;
}

/** Earliest persisted after-hours baseline among non-expired overrides. */
export function getOutsideGrantBaselineUsedMinutes(
  overrides: ExtensionOverrideInput[],
  now: Date = new Date()
): number | null {
  const baselines = overrides
    .filter((o) => o.expiresAt > now)
    .map((o) => o.outsideGrantBaselineUsedMinutes)
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (baselines.length === 0) return null;
  return Math.min(...baselines);
}

/**
 * Remaining after-hours extension minutes.
 * When baseline is null, treats current used as the pierce point (pre-persist).
 */
export function getOutsideExtensionRemainingMinutes(args: {
  bonusMinutes: number;
  usedMinutesToday: number;
  dailyLimitMinutes: number;
  baselineUsedMinutes: number | null;
}): number {
  const { bonusMinutes, usedMinutesToday, dailyLimitMinutes } = args;
  if (bonusMinutes <= 0) return 0;

  const baselineUsedMinutes =
    args.baselineUsedMinutes ?? usedMinutesToday;
  const grantSize = Math.max(
    0,
    bonusMinutes - Math.max(0, baselineUsedMinutes - dailyLimitMinutes)
  );
  const consumed = Math.max(0, usedMinutesToday - baselineUsedMinutes);
  return Math.max(0, grantSize - consumed);
}

function pickLimitingFactor(
  dailyRemaining: number,
  windowRemaining: number | undefined,
  hasWindows: boolean
): LimitingFactor {
  if (!hasWindows || windowRemaining === undefined) {
    return "daily_limit";
  }
  // Exact tie → prefer daily_limit
  if (dailyRemaining <= windowRemaining) {
    return "daily_limit";
  }
  return "window";
}

export function evaluatePolicy(
  policy: ScreenTimePolicyInput,
  usedMinutesToday: number,
  overrides: ExtensionOverrideInput[],
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE
): PolicyEvaluation {
  const bonusMinutes = getActiveBonusMinutes(overrides, now);
  const effectiveLimit = policy.dailyLimitMinutes + bonusMinutes;
  const dailyRemainingMinutes = Math.max(0, effectiveLimit - usedMinutesToday);
  const hasWindows = policy.allowedWindows.length > 0;

  const { dayOfWeek: today } = getZonedTimeParts(now, timeZone);
  const windowCapacityMinutes = hasWindows
    ? getWindowCapacityMinutes(policy.allowedWindows, today)
    : 0;
  const windowCapacityToday = hasWindows
    ? windowCapacityMinutes
    : effectiveLimit;
  const reachableMinutesToday = Math.min(effectiveLimit, windowCapacityToday);

  if (!policy.isActive) {
    return {
      status: "allowed",
      remainingMinutes: 999,
      dailyRemainingMinutes,
      windowCapacityMinutes,
      inWindow: true,
      limitingFactor: "none",
      reachableMinutesToday,
      usedMinutes: usedMinutesToday,
      dailyLimitMinutes: policy.dailyLimitMinutes,
      bonusMinutes,
    };
  }

  const { inWindow, nextStart, windowEndMinutes } = resolveWindowState(
    policy.allowedWindows,
    now,
    timeZone
  );

  if (!inWindow) {
    const baselineUsedMinutes = getOutsideGrantBaselineUsedMinutes(
      overrides,
      now
    );
    const bonusRemaining = getOutsideExtensionRemainingMinutes({
      bonusMinutes,
      usedMinutesToday,
      dailyLimitMinutes: policy.dailyLimitMinutes,
      baselineUsedMinutes,
    });
    if (bonusRemaining > 0) {
      return {
        status: "allowed",
        remainingMinutes: bonusRemaining,
        dailyRemainingMinutes,
        windowCapacityMinutes,
        inWindow: false,
        limitingFactor: "daily_limit",
        reachableMinutesToday,
        usedMinutes: usedMinutesToday,
        dailyLimitMinutes: policy.dailyLimitMinutes,
        bonusMinutes,
      };
    }

    return {
      status: "outside_window",
      remainingMinutes: 0,
      dailyRemainingMinutes,
      windowCapacityMinutes,
      inWindow: false,
      limitingFactor: "window",
      reachableMinutesToday,
      usedMinutes: usedMinutesToday,
      dailyLimitMinutes: policy.dailyLimitMinutes,
      bonusMinutes,
      nextWindowStart: nextStart,
      message: nextStart
        ? `Not available until ${nextStart}`
        : "Outside allowed hours",
    };
  }

  const { minutesSinceMidnight: currentMinutes } = getZonedTimeParts(
    now,
    timeZone
  );
  const windowRemainingMinutes =
    hasWindows && windowEndMinutes !== undefined
      ? Math.max(0, windowEndMinutes - currentMinutes)
      : undefined;

  if (usedMinutesToday >= effectiveLimit) {
    return {
      status: "blocked",
      remainingMinutes: 0,
      dailyRemainingMinutes: 0,
      windowRemainingMinutes,
      windowCapacityMinutes,
      inWindow: true,
      limitingFactor: "daily_limit",
      reachableMinutesToday,
      usedMinutes: usedMinutesToday,
      dailyLimitMinutes: policy.dailyLimitMinutes,
      bonusMinutes,
      message: "Daily screen time limit reached",
    };
  }

  const limitingFactor = pickLimitingFactor(
    dailyRemainingMinutes,
    windowRemainingMinutes,
    hasWindows
  );
  const remainingMinutes =
    windowRemainingMinutes === undefined
      ? dailyRemainingMinutes
      : Math.min(dailyRemainingMinutes, windowRemainingMinutes);

  return {
    status: "allowed",
    remainingMinutes,
    dailyRemainingMinutes,
    windowRemainingMinutes,
    windowCapacityMinutes,
    inWindow: true,
    limitingFactor,
    reachableMinutesToday,
    usedMinutes: usedMinutesToday,
    dailyLimitMinutes: policy.dailyLimitMinutes,
    bonusMinutes,
  };
}

export function shouldLock(evaluation: PolicyEvaluation): boolean {
  return evaluation.status === "blocked" || evaluation.status === "outside_window";
}

export function getPolicyStatusLabel(status: PolicyStatus): string {
  switch (status) {
    case "allowed":
      return "Within limits";
    case "blocked":
      return "Limit reached";
    case "outside_window":
      return "Outside allowed hours";
  }
}

/** True when unlocked only by after-hours bonus (outside schedule, grant remaining). */
export function isAfterHoursBonusActive(
  evaluation: Pick<
    PolicyEvaluation,
    "status" | "inWindow" | "bonusMinutes" | "remainingMinutes"
  >
): boolean {
  return (
    evaluation.status === "allowed" &&
    evaluation.inWindow === false &&
    evaluation.bonusMinutes > 0 &&
    evaluation.remainingMinutes > 0
  );
}

/**
 * Parent-facing status pill label. After-hours bonus sessions show
 * "Bonus time" instead of generic "Within limits".
 */
export function getEvaluationStatusLabel(
  evaluation: Pick<
    PolicyEvaluation,
    "status" | "inWindow" | "bonusMinutes" | "remainingMinutes"
  >
): string {
  if (isAfterHoursBonusActive(evaluation)) {
    return "Bonus time";
  }
  return getPolicyStatusLabel(evaluation.status);
}

export function generatePairingCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateDeviceToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
