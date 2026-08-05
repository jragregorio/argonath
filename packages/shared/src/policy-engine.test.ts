import { describe, it, expect } from "vitest";
import {
  evaluatePolicy,
  getPolicyReach,
  getWindowCapacityMinutes,
  mergeWindows,
  shouldLock,
} from "./policy-engine";
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
    expect(result.dailyRemainingMinutes).toBe(30);
    expect(result.limitingFactor).toBe("daily_limit");
    expect(result.reachableMinutesToday).toBe(60);
    expect(shouldLock(result)).toBe(false);
  });

  it("blocks when daily limit reached", () => {
    const result = evaluatePolicy(basePolicy, 60, []);
    expect(result.status).toBe("blocked");
    expect(result.dailyRemainingMinutes).toBe(0);
    expect(result.limitingFactor).toBe("daily_limit");
    expect(shouldLock(result)).toBe(true);
  });

  it("includes bonus minutes from extensions", () => {
    const result = evaluatePolicy(basePolicy, 60, [
      { extraMinutes: 30, expiresAt: new Date(Date.now() + 3600000) },
    ]);
    expect(result.status).toBe("allowed");
    expect(result.remainingMinutes).toBe(30);
    expect(result.dailyRemainingMinutes).toBe(30);
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
    expect(result.remainingMinutes).toBe(0);
    expect(result.dailyRemainingMinutes).toBe(120);
    expect(result.limitingFactor).toBe("window");
    expect(result.windowRemainingMinutes).toBeUndefined();
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

  it("window tighter than budget yields window-bound session remaining", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 120,
      allowedWindows: [{ day: 1, start: "06:00", end: "10:00" }],
      isActive: true,
    };
    // Monday 09:30 UTC — 30 min of window left, full daily budget unused
    const at0930 = new Date("2026-01-05T09:30:00.000Z");
    const result = evaluatePolicy(policy, 0, [], at0930, "UTC");
    expect(result.status).toBe("allowed");
    expect(result.remainingMinutes).toBe(30);
    expect(result.dailyRemainingMinutes).toBe(120);
    expect(result.windowRemainingMinutes).toBe(30);
    expect(result.limitingFactor).toBe("window");
    expect(shouldLock(result)).toBe(false);
  });

  it("budget tighter than window yields daily_limit", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 60,
      allowedWindows: [{ day: 1, start: "06:00", end: "12:00" }],
      isActive: true,
    };
    // Monday 07:00 — 300 min of window left, 40 daily remaining
    const at0700 = new Date("2026-01-05T07:00:00.000Z");
    const result = evaluatePolicy(policy, 20, [], at0700, "UTC");
    expect(result.status).toBe("allowed");
    expect(result.remainingMinutes).toBe(40);
    expect(result.dailyRemainingMinutes).toBe(40);
    expect(result.windowRemainingMinutes).toBe(300);
    expect(result.limitingFactor).toBe("daily_limit");
  });

  it("on exact tie prefers daily_limit", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 30,
      allowedWindows: [{ day: 1, start: "06:00", end: "10:00" }],
      isActive: true,
    };
    // Monday 09:30 — window remaining 30, daily remaining 30
    const at0930 = new Date("2026-01-05T09:30:00.000Z");
    const result = evaluatePolicy(policy, 0, [], at0930, "UTC");
    expect(result.remainingMinutes).toBe(30);
    expect(result.limitingFactor).toBe("daily_limit");
  });

  it("outside window with budget left still reports dailyRemainingMinutes", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 120,
      allowedWindows: [{ day: 1, start: "06:00", end: "10:00" }],
      isActive: true,
    };
    const mondayNoon = new Date("2026-01-05T12:00:00.000Z");
    const result = evaluatePolicy(policy, 15, [], mondayNoon, "UTC");
    expect(result.status).toBe("outside_window");
    expect(result.remainingMinutes).toBe(0);
    expect(result.dailyRemainingMinutes).toBe(105);
    expect(shouldLock(result)).toBe(true);
  });

  it("merges adjacent windows into one run for session remaining", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 300,
      allowedWindows: [
        { day: 1, start: "06:00", end: "08:00" },
        { day: 1, start: "08:00", end: "10:00" },
      ],
      isActive: true,
    };
    // Monday 07:50 — should see through to 10:00 → 130 min, not 10
    const at0750 = new Date("2026-01-05T07:50:00.000Z");
    const result = evaluatePolicy(policy, 0, [], at0750, "UTC");
    expect(result.status).toBe("allowed");
    expect(result.remainingMinutes).toBe(130);
    expect(result.windowRemainingMinutes).toBe(130);
    expect(result.limitingFactor).toBe("window");
  });

  it("merges overlapping windows", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 500,
      allowedWindows: [
        { day: 1, start: "06:00", end: "09:00" },
        { day: 1, start: "08:00", end: "11:00" },
      ],
      isActive: true,
    };
    const at0700 = new Date("2026-01-05T07:00:00.000Z");
    const result = evaluatePolicy(policy, 0, [], at0700, "UTC");
    expect(result.windowRemainingMinutes).toBe(240); // until 11:00
    expect(result.reachableMinutesToday).toBe(300); // 06:00–11:00
  });

  it("later second window today does not inflate current session remaining", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 420,
      allowedWindows: [
        { day: 1, start: "06:00", end: "10:00" },
        { day: 1, start: "18:00", end: "20:00" },
      ],
      isActive: true,
    };
    // Monday 09:50 — current run ends 10:00 → 10 min session; daily untouched
    const at0950 = new Date("2026-01-05T09:50:00.000Z");
    const result = evaluatePolicy(policy, 0, [], at0950, "UTC");
    expect(result.remainingMinutes).toBe(10);
    expect(result.windowRemainingMinutes).toBe(10);
    expect(result.dailyRemainingMinutes).toBe(420);
    expect(result.limitingFactor).toBe("window");
    expect(result.reachableMinutesToday).toBe(360); // 4h + 2h
  });

  it("reachableMinutesToday clamps to window capacity", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 420,
      allowedWindows: [{ day: 1, start: "06:00", end: "12:00" }],
      isActive: true,
    };
    const at0700 = new Date("2026-01-05T07:00:00.000Z");
    const result = evaluatePolicy(policy, 0, [], at0700, "UTC");
    expect(result.reachableMinutesToday).toBe(360);
  });

  it("inactive policy gives 999 remaining and limitingFactor none", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 60,
      allowedWindows: [{ day: 1, start: "06:00", end: "10:00" }],
      isActive: false,
    };
    const at0700 = new Date("2026-01-05T07:00:00.000Z");
    const result = evaluatePolicy(policy, 10, [], at0700, "UTC");
    expect(result.status).toBe("allowed");
    expect(result.remainingMinutes).toBe(999);
    expect(result.limitingFactor).toBe("none");
    expect(result.dailyRemainingMinutes).toBe(50);
    expect(shouldLock(result)).toBe(false);
  });

  describe("extension outside allowed window", () => {
    const wedWindowPolicy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 120,
      allowedWindows: [{ day: 3, start: "04:00", end: "19:00" }],
      isActive: true,
    };
    // Wednesday 2026-01-07 20:00 UTC — outside 04:00–19:00 window
    const wed8pm = new Date("2026-01-07T20:00:00.000Z");
    const activeBonus = [
      { extraMinutes: 15, expiresAt: new Date("2026-01-08T00:00:00.000Z") },
    ];

    it("allows unused bonus only, not full daily leftover (Wed 8 PM +15 min)", () => {
      const result = evaluatePolicy(
        wedWindowPolicy,
        30,
        activeBonus,
        wed8pm,
        "UTC"
      );
      expect(result.status).toBe("allowed");
      expect(result.remainingMinutes).toBe(15);
      expect(result.dailyRemainingMinutes).toBe(105);
      expect(result.limitingFactor).toBe("daily_limit");
      expect(shouldLock(result)).toBe(false);
    });

    it("allows partially consumed bonus outside window", () => {
      const result = evaluatePolicy(
        wedWindowPolicy,
        130,
        activeBonus,
        wed8pm,
        "UTC"
      );
      expect(result.status).toBe("allowed");
      expect(result.remainingMinutes).toBe(5);
      expect(result.limitingFactor).toBe("daily_limit");
      expect(shouldLock(result)).toBe(false);
    });

    it("locks when bonus fully consumed outside window", () => {
      const result = evaluatePolicy(
        wedWindowPolicy,
        135,
        activeBonus,
        wed8pm,
        "UTC"
      );
      expect(result.status).toBe("outside_window");
      expect(result.remainingMinutes).toBe(0);
      expect(result.limitingFactor).toBe("window");
      expect(shouldLock(result)).toBe(true);
    });

    it("stays outside_window with daily leftover but no bonus", () => {
      const result = evaluatePolicy(wedWindowPolicy, 30, [], wed8pm, "UTC");
      expect(result.status).toBe("outside_window");
      expect(result.remainingMinutes).toBe(0);
      expect(result.dailyRemainingMinutes).toBe(90);
      expect(result.limitingFactor).toBe("window");
      expect(shouldLock(result)).toBe(true);
    });
  });

  it("computes window remaining in a non-UTC family timezone", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 200,
      // Thursday = 4, window 06:00–12:00 Manila
      allowedWindows: [{ day: 4, start: "06:00", end: "12:00" }],
      isActive: true,
    };
    // Wed 23:15 UTC = Thu 07:15 Asia/Manila → 285 min until 12:00
    const utcWedNight = new Date("2026-07-29T23:15:00.000Z");
    const result = evaluatePolicy(policy, 0, [], utcWedNight, "Asia/Manila");
    expect(result.status).toBe("allowed");
    expect(result.windowRemainingMinutes).toBe(285);
    expect(result.remainingMinutes).toBe(200); // daily tighter
    expect(result.limitingFactor).toBe("daily_limit");
  });
});

describe("mergeWindows", () => {
  it("merges adjacent windows on the same day", () => {
    expect(
      mergeWindows([
        { day: 1, start: "06:00", end: "08:00" },
        { day: 1, start: "08:00", end: "10:00" },
      ])
    ).toEqual([{ day: 1, start: "06:00", end: "10:00" }]);
  });

  it("merges overlapping windows", () => {
    expect(
      mergeWindows([
        { day: 2, start: "09:00", end: "12:00" },
        { day: 2, start: "11:00", end: "14:00" },
      ])
    ).toEqual([{ day: 2, start: "09:00", end: "14:00" }]);
  });

  it("does not merge across different days", () => {
    expect(
      mergeWindows([
        { day: 1, start: "06:00", end: "10:00" },
        { day: 2, start: "06:00", end: "10:00" },
      ])
    ).toEqual([
      { day: 1, start: "06:00", end: "10:00" },
      { day: 2, start: "06:00", end: "10:00" },
    ]);
  });

  it("leaves a gap as two separate runs", () => {
    expect(
      mergeWindows([
        { day: 1, start: "06:00", end: "08:00" },
        { day: 1, start: "09:00", end: "10:00" },
      ])
    ).toEqual([
      { day: 1, start: "06:00", end: "08:00" },
      { day: 1, start: "09:00", end: "10:00" },
    ]);
  });
});

describe("getWindowCapacityMinutes / getPolicyReach", () => {
  it("sums merged capacity for a day", () => {
    expect(
      getWindowCapacityMinutes(
        [
          { day: 1, start: "06:00", end: "08:00" },
          { day: 1, start: "08:00", end: "10:00" },
          { day: 1, start: "18:00", end: "20:00" },
        ],
        1
      )
    ).toBe(360);
  });

  it("getPolicyReach flags constrained days and suggests min windowed capacity", () => {
    const reach = getPolicyReach({
      dailyLimitMinutes: 420,
      allowedWindows: [1, 2, 3, 4, 5].map((day) => ({
        day,
        start: "06:00",
        end: "12:00",
      })),
    });
    expect(reach.constrainedDays).toEqual([1, 2, 3, 4, 5]);
    expect(reach.minWindowedCapacityMinutes).toBe(360);
    expect(reach.byDay[0].capacityMinutes).toBe(360);
    expect(reach.byDay[5].capacityMinutes).toBe(0); // Sat — no windows
    expect(reach.byDay[5].constrained).toBe(false);
  });

  it("getPolicyReach excludes zero-window days from the suggested minimum", () => {
    const reach = getPolicyReach({
      dailyLimitMinutes: 420,
      allowedWindows: [
        { day: 1, start: "06:00", end: "10:00" }, // 240
        { day: 2, start: "06:00", end: "12:00" }, // 360
      ],
    });
    expect(reach.minWindowedCapacityMinutes).toBe(240);
    expect(reach.constrainedDays).toEqual([1, 2]);
  });

  it("getPolicyReach with empty windows has null suggestion", () => {
    const reach = getPolicyReach({
      dailyLimitMinutes: 120,
      allowedWindows: [],
    });
    expect(reach.minWindowedCapacityMinutes).toBeNull();
    expect(reach.constrainedDays).toEqual([]);
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
