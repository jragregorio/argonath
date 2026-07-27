import type {
  AllowedWindow,
  ExtensionOverrideInput,
  PolicyEvaluation,
  PolicyStatus,
  ScreenTimePolicyInput,
} from "./types";

function parseTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function getDayOfWeek(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function getMinutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function isWithinWindow(
  windows: AllowedWindow[],
  now: Date
): { inWindow: boolean; nextStart?: string } {
  if (windows.length === 0) {
    return { inWindow: true };
  }

  const currentDay = getDayOfWeek(now);
  const currentMinutes = getMinutesSinceMidnight(now);

  const todayWindows = windows.filter((w) => w.day === currentDay);
  for (const window of todayWindows) {
    const start = parseTime(window.start);
    const end = parseTime(window.end);
    if (currentMinutes >= start && currentMinutes < end) {
      return { inWindow: true };
    }
  }

  const sortedWindows = [...windows].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return parseTime(a.start) - parseTime(b.start);
  });

  for (const window of sortedWindows) {
    const start = parseTime(window.start);
    if (
      window.day > currentDay ||
      (window.day === currentDay && start > currentMinutes)
    ) {
      const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return {
        inWindow: false,
        nextStart: `${dayNames[window.day]} ${window.start}`,
      };
    }
  }

  if (sortedWindows.length > 0) {
    const first = sortedWindows[0];
    const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return {
      inWindow: false,
      nextStart: `${dayNames[first.day]} ${first.start}`,
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

export function evaluatePolicy(
  policy: ScreenTimePolicyInput,
  usedMinutesToday: number,
  overrides: ExtensionOverrideInput[],
  now: Date = new Date()
): PolicyEvaluation {
  const bonusMinutes = getActiveBonusMinutes(overrides, now);
  const effectiveLimit = policy.dailyLimitMinutes + bonusMinutes;
  const remainingMinutes = Math.max(0, effectiveLimit - usedMinutesToday);

  if (!policy.isActive) {
    return {
      status: "allowed",
      remainingMinutes: 999,
      usedMinutes: usedMinutesToday,
      dailyLimitMinutes: policy.dailyLimitMinutes,
      bonusMinutes,
    };
  }

  const { inWindow, nextStart } = isWithinWindow(policy.allowedWindows, now);

  if (!inWindow) {
    return {
      status: "outside_window",
      remainingMinutes: 0,
      usedMinutes: usedMinutesToday,
      dailyLimitMinutes: policy.dailyLimitMinutes,
      bonusMinutes,
      nextWindowStart: nextStart,
      message: nextStart
        ? `Not available until ${nextStart}`
        : "Outside allowed hours",
    };
  }

  if (usedMinutesToday >= effectiveLimit) {
    return {
      status: "blocked",
      remainingMinutes: 0,
      usedMinutes: usedMinutesToday,
      dailyLimitMinutes: policy.dailyLimitMinutes,
      bonusMinutes,
      message: "Daily screen time limit reached",
    };
  }

  return {
    status: "allowed",
    remainingMinutes,
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
      return "Active";
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
