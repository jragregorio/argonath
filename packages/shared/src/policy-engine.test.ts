import { describe, it, expect } from "vitest";
import { evaluatePolicy, shouldLock } from "./policy-engine";
import { getCalendarDateInTimeZone, getZonedTimeParts } from "./timezone";
import type { ScreenTimePolicyInput } from "./types";

describe("policy engine", () => {
  const basePolicy: ScreenTimePolicyInput = {
    dailyLimitMinutes: 60,
    allowedWindows: [],
    isActive: true,
  };

  it("allows when under daily limit", () => {
    const result = evaluatePolicy(basePolicy, 30, []);
    expect(result.status).toBe("allowed");
    expect(result.remainingMinutes).toBe(30);
    expect(shouldLock(result)).toBe(false);
  });

  it("blocks when daily limit reached", () => {
    const result = evaluatePolicy(basePolicy, 60, []);
    expect(result.status).toBe("blocked");
    expect(shouldLock(result)).toBe(true);
  });

  it("includes bonus minutes from extensions", () => {
    const result = evaluatePolicy(basePolicy, 60, [
      { extraMinutes: 30, expiresAt: new Date(Date.now() + 3600000) },
    ]);
    expect(result.status).toBe("allowed");
    expect(result.remainingMinutes).toBe(30);
  });

  it("blocks outside allowed window in UTC", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 120,
      allowedWindows: [{ day: 1, start: "22:00", end: "23:00" }],
      isActive: true,
    };
    // Monday noon UTC
    const mondayNoon = new Date("2026-01-05T12:00:00.000Z");
    const result = evaluatePolicy(policy, 0, [], mondayNoon, "UTC");
    expect(result.status).toBe("outside_window");
    expect(shouldLock(result)).toBe(true);
  });

  it("allows inside window when family timezone is ahead of UTC", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 100,
      // Thursday = 4
      allowedWindows: [{ day: 4, start: "06:00", end: "12:00" }],
      isActive: true,
    };
    // Wed 23:15 UTC = Thu 07:15 Asia/Manila (UTC+8)
    const utcWedNight = new Date("2026-07-29T23:15:00.000Z");

    const utcEval = evaluatePolicy(policy, 0, [], utcWedNight, "UTC");
    expect(utcEval.status).toBe("outside_window");

    const manilaEval = evaluatePolicy(
      policy,
      0,
      [],
      utcWedNight,
      "Asia/Manila"
    );
    expect(manilaEval.status).toBe("allowed");
  });
});

describe("timezone helpers", () => {
  it("maps UTC instant to Manila wall clock", () => {
    const parts = getZonedTimeParts(
      new Date("2026-07-29T23:15:00.000Z"),
      "Asia/Manila"
    );
    expect(parts.dayOfWeek).toBe(4); // Thursday
    expect(parts.hour).toBe(7);
    expect(parts.minute).toBe(15);
    expect(parts.minutesSinceMidnight).toBe(7 * 60 + 15);
  });

  it("returns calendar date for Prisma @db.Date", () => {
    const date = getCalendarDateInTimeZone(
      new Date("2026-07-29T23:15:00.000Z"),
      "Asia/Manila"
    );
    expect(date.toISOString().slice(0, 10)).toBe("2026-07-30");
  });
});
