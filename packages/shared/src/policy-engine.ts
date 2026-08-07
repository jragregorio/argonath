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
    const bonusRemaining = Math.max(
      0,
      bonusMinutes - Math.max(0, usedMinutesToday - policy.dailyLimitMinutes)
    );
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
