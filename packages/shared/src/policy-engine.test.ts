import { describe, it, expect } from "vitest";
import {
  computeIdealOutsideGrantBaseline,
  evaluatePolicy,
  getEvaluationStatusLabel,
  getMinutesSinceTodayWindowEnded,
  getOutsideExtensionRemainingMinutes,
  getPolicyReach,
  getWindowCapacityMinutes,
  isAfterHoursBonusActive,
  isGrantCreatedAfterTodayWindowEnd,
  LATE_OUTSIDE_BASELINE_MINUTES,
  mergeWindows,
  resolveOutsideGrantBaselineToPersist,
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
    expect(result.windowCapacityMinutes).toBe(240);
    expect(result.inWindow).toBe(true);
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
      expect(result.inWindow).toBe(false);
      expect(shouldLock(result)).toBe(false);
    });

    it("counts down from after-hours baseline while still under daily limit", () => {
      const withBaseline = [
        {
          extraMinutes: 120,
          expiresAt: new Date("2026-01-08T00:00:00.000Z"),
          outsideGrantBaselineUsedMinutes: 250,
        },
      ];
      const policy: ScreenTimePolicyInput = {
        dailyLimitMinutes: 900,
        allowedWindows: [{ day: 3, start: "04:00", end: "19:00" }],
        isActive: true,
      };
      const result = evaluatePolicy(policy, 273, withBaseline, wed8pm, "UTC");
      expect(result.status).toBe("allowed");
      expect(result.inWindow).toBe(false);
      expect(result.remainingMinutes).toBe(97);
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

  describe("pre-window bonus handoff", () => {
    // Thursday 2026-01-08, window 15:00–18:00 UTC
    const thuWindowPolicy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 180,
      allowedWindows: [{ day: 4, start: "15:00", end: "18:00" }],
      isActive: true,
    };
    const thuMidnight = new Date("2026-01-09T00:00:00.000Z");
    const grantAt1400 = {
      extraMinutes: 60,
      createdAt: new Date("2026-01-08T14:00:00.000Z"),
      expiresAt: thuMidnight,
      outsideGrantBaselineUsedMinutes: 0,
    };

    it("bridges to scheduled window when grant wall-clock reaches window start", () => {
      const at1459 = new Date("2026-01-08T14:59:00.000Z");
      const result = evaluatePolicy(
        thuWindowPolicy,
        60,
        [grantAt1400],
        at1459,
        "UTC"
      );
      expect(result.status).toBe("allowed");
      expect(result.inWindow).toBe(false);
      expect(result.remainingMinutes).toBe(1);
      expect(shouldLock(result)).toBe(false);

      const at1500 = new Date("2026-01-08T15:00:00.000Z");
      const inWindow = evaluatePolicy(
        thuWindowPolicy,
        60,
        [grantAt1400],
        at1500,
        "UTC"
      );
      expect(inWindow.status).toBe("allowed");
      expect(inWindow.inWindow).toBe(true);
      expect(shouldLock(inWindow)).toBe(false);
    });

    it("bridges in Asia/Manila family timezone (UTC grant instants)", () => {
      const manilaTz = "Asia/Manila";
      const grantAt1400Manila = {
        extraMinutes: 60,
        createdAt: new Date("2026-01-08T06:00:00.000Z"), // 14:00 Manila
        expiresAt: new Date("2026-01-08T16:00:00.000Z"), // midnight Manila
        outsideGrantBaselineUsedMinutes: 0,
      };
      const at1459Manila = new Date("2026-01-08T06:59:00.000Z"); // 14:59 Manila
      const result = evaluatePolicy(
        thuWindowPolicy,
        60,
        [grantAt1400Manila],
        at1459Manila,
        manilaTz
      );
      expect(result.status).toBe("allowed");
      expect(result.inWindow).toBe(false);
      expect(result.remainingMinutes).toBe(1);
      expect(shouldLock(result)).toBe(false);

      const at1500Manila = new Date("2026-01-08T07:00:00.000Z"); // 15:00 Manila
      const inWindow = evaluatePolicy(
        thuWindowPolicy,
        60,
        [grantAt1400Manila],
        at1500Manila,
        manilaTz
      );
      expect(inWindow.status).toBe("allowed");
      expect(inWindow.inWindow).toBe(true);
      expect(shouldLock(inWindow)).toBe(false);
    });

    it("locks when grant wall-clock end is before next today window", () => {
      const grantAt1300 = {
        ...grantAt1400,
        createdAt: new Date("2026-01-08T13:00:00.000Z"),
      };
      const at1400 = new Date("2026-01-08T14:00:00.000Z");
      const result = evaluatePolicy(
        thuWindowPolicy,
        60,
        [grantAt1300],
        at1400,
        "UTC"
      );
      expect(result.status).toBe("outside_window");
      expect(shouldLock(result)).toBe(true);
    });

    it("evening after-hours still locks when pool spent and next window is tomorrow", () => {
      const wedWindowPolicy: ScreenTimePolicyInput = {
        dailyLimitMinutes: 120,
        allowedWindows: [{ day: 3, start: "04:00", end: "19:00" }],
        isActive: true,
      };
      const wed8pm = new Date("2026-01-07T20:00:00.000Z");
      const activeBonus = [
        {
          extraMinutes: 15,
          createdAt: new Date("2026-01-07T20:00:00.000Z"),
          expiresAt: new Date("2026-01-08T00:00:00.000Z"),
        },
      ];
      const result = evaluatePolicy(
        wedWindowPolicy,
        135,
        activeBonus,
        wed8pm,
        "UTC"
      );
      expect(result.status).toBe("outside_window");
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

describe("after-hours baseline backfill", () => {
  const friWindow = [{ day: 5, start: "05:00", end: "19:00" }];
  // Friday 2026-01-09 19:42 UTC — 42 min after 19:00 window end
  const friAfterHours = new Date("2026-01-09T19:42:00.000Z");

  it("getMinutesSinceTodayWindowEnded returns elapsed minutes after window end", () => {
    expect(
      getMinutesSinceTodayWindowEnded(friWindow, friAfterHours, "UTC")
    ).toBe(42);
  });

  it("returns null while inside today's window", () => {
    const friMidday = new Date("2026-01-09T12:00:00.000Z");
    expect(
      getMinutesSinceTodayWindowEnded(friWindow, friMidday, "UTC")
    ).toBeNull();
  });

  it("returns null before first window of the day", () => {
    const friEarly = new Date("2026-01-09T04:00:00.000Z");
    expect(
      getMinutesSinceTodayWindowEnded(friWindow, friEarly, "UTC")
    ).toBeNull();
  });

  it("computeIdealOutsideGrantBaseline backfills from window end (used 268 → ~226)", () => {
    const ideal = computeIdealOutsideGrantBaseline({
      usedMinutes: 268,
      bonusMinutes: 120,
      dailyLimitMinutes: 900,
      minutesSinceWindowEnded: 42,
    });
    expect(ideal).toBe(226);
  });

  it("ideal baseline yields agent-parity remaining via grant math", () => {
    const ideal = computeIdealOutsideGrantBaseline({
      usedMinutes: 268,
      bonusMinutes: 120,
      dailyLimitMinutes: 900,
      minutesSinceWindowEnded: 42,
    });
    const remaining = getOutsideExtensionRemainingMinutes({
      bonusMinutes: 120,
      usedMinutesToday: 268,
      dailyLimitMinutes: 900,
      baselineUsedMinutes: ideal,
    });
    expect(remaining).toBe(78);
  });

  it("clamps ideal baseline so consumed after-hours cannot exceed grant", () => {
    const ideal = computeIdealOutsideGrantBaseline({
      usedMinutes: 268,
      bonusMinutes: 120,
      dailyLimitMinutes: 900,
      minutesSinceWindowEnded: 200,
    });
    expect(ideal).toBe(148);
    expect(
      getOutsideExtensionRemainingMinutes({
        bonusMinutes: 120,
        usedMinutesToday: 268,
        dailyLimitMinutes: 900,
        baselineUsedMinutes: ideal,
      })
    ).toBe(0);
  });
});

describe("resolveOutsideGrantBaselineToPersist", () => {
  const bonus = 120;
  const dailyLimit = 900;
  const friWindow = [{ day: 5, start: "05:00", end: "19:00" }];
  const friAfterHours = new Date("2026-01-09T19:42:00.000Z");
  const friGrantAtWindowEnd = new Date("2026-01-09T19:00:00.000Z");
  const friPostWindowGrant = new Date("2026-01-09T19:19:00.000Z");

  it("pierce path: elapsed 0 or 1 uses current used as baseline", () => {
    for (const elapsed of [0, 1]) {
      expect(
        resolveOutsideGrantBaselineToPersist({
          usedMinutes: 250,
          bonusMinutes: bonus,
          dailyLimitMinutes: dailyLimit,
          minutesSinceWindowEnded: elapsed,
          storedBaseline: null,
          grantCreatedAfterWindowEnd: false,
        })
      ).toBe(250);
    }
  });

  it("late first observe for pre-window grant uses ideal backfill", () => {
    const used = 268;
    const elapsed = 42;
    const ideal = computeIdealOutsideGrantBaseline({
      usedMinutes: used,
      bonusMinutes: bonus,
      dailyLimitMinutes: dailyLimit,
      minutesSinceWindowEnded: elapsed,
    });
    expect(ideal).toBe(226);
    expect(
      resolveOutsideGrantBaselineToPersist({
        usedMinutes: used,
        bonusMinutes: bonus,
        dailyLimitMinutes: dailyLimit,
        minutesSinceWindowEnded: elapsed,
        storedBaseline: null,
        grantCreatedAfterWindowEnd: false,
      })
    ).toBe(ideal);
    expect(elapsed).toBeGreaterThanOrEqual(LATE_OUTSIDE_BASELINE_MINUTES);
  });

  it("post-window approval pierces at used even when late first observe", () => {
    const used = 42;
    const elapsed = 19;
    const bonusMinutes = 15;
    expect(
      isGrantCreatedAfterTodayWindowEnd(
        friWindow,
        friPostWindowGrant,
        friAfterHours,
        "UTC"
      )
    ).toBe(true);
    expect(
      resolveOutsideGrantBaselineToPersist({
        usedMinutes: used,
        bonusMinutes,
        dailyLimitMinutes: dailyLimit,
        minutesSinceWindowEnded: elapsed,
        storedBaseline: null,
        grantCreatedAfterWindowEnd: true,
      })
    ).toBe(used);
    expect(
      getOutsideExtensionRemainingMinutes({
        bonusMinutes,
        usedMinutesToday: used,
        dailyLimitMinutes: dailyLimit,
        baselineUsedMinutes: used,
      })
    ).toBe(bonusMinutes);
  });

  it("isGrantCreatedAfterTodayWindowEnd false when grant existed at window end", () => {
    expect(
      isGrantCreatedAfterTodayWindowEnd(
        friWindow,
        friGrantAtWindowEnd,
        friAfterHours,
        "UTC"
      )
    ).toBe(false);
  });

  it("repairs stored baseline downward when stored > ideal (pre-window grant)", () => {
    const used = 268;
    const elapsed = 42;
    const ideal = computeIdealOutsideGrantBaseline({
      usedMinutes: used,
      bonusMinutes: bonus,
      dailyLimitMinutes: dailyLimit,
      minutesSinceWindowEnded: elapsed,
    });
    const repaired = resolveOutsideGrantBaselineToPersist({
      usedMinutes: used,
      bonusMinutes: bonus,
      dailyLimitMinutes: dailyLimit,
      minutesSinceWindowEnded: elapsed,
      storedBaseline: 300,
      grantCreatedAfterWindowEnd: false,
    });
    expect(repaired).toBe(ideal);
    expect(repaired).toBeLessThan(300);
  });

  it("keeps post-window stored baseline immutable when remaining is 0", () => {
    const used = 47;
    const elapsed = 26;
    const bonusMinutes = 15;
    const approveTimeBaseline = 41;
    expect(
      getOutsideExtensionRemainingMinutes({
        bonusMinutes,
        usedMinutesToday: used,
        dailyLimitMinutes: dailyLimit,
        baselineUsedMinutes: approveTimeBaseline,
      })
    ).toBe(9);
    const persisted = resolveOutsideGrantBaselineToPersist({
      usedMinutes: used,
      bonusMinutes,
      dailyLimitMinutes: dailyLimit,
      minutesSinceWindowEnded: elapsed,
      storedBaseline: approveTimeBaseline,
      grantCreatedAfterWindowEnd: true,
    });
    expect(persisted).toBe(approveTimeBaseline);
    expect(persisted).not.toBe(used);
    expect(
      getOutsideExtensionRemainingMinutes({
        bonusMinutes,
        usedMinutesToday: used,
        dailyLimitMinutes: dailyLimit,
        baselineUsedMinutes: persisted,
      })
    ).toBe(9);
  });

  it("stacking after-hours bonus reuses lower existing baseline", () => {
    const existingBaseline = 41;
    const used = 47;
    const bonusMinutes = 30;
    expect(
      resolveOutsideGrantBaselineToPersist({
        usedMinutes: used,
        bonusMinutes,
        dailyLimitMinutes: dailyLimit,
        minutesSinceWindowEnded: 26,
        storedBaseline: existingBaseline,
        grantCreatedAfterWindowEnd: true,
      })
    ).toBe(existingBaseline);
  });

  it("consumed extension tracks used minus baseline under daily limit", () => {
    const baseline = resolveOutsideGrantBaselineToPersist({
      usedMinutes: 250,
      bonusMinutes: bonus,
      dailyLimitMinutes: dailyLimit,
      minutesSinceWindowEnded: 0,
      storedBaseline: null,
      grantCreatedAfterWindowEnd: false,
    });
    expect(baseline).toBe(250);
    expect(
      getOutsideExtensionRemainingMinutes({
        bonusMinutes: bonus,
        usedMinutesToday: 268,
        dailyLimitMinutes: dailyLimit,
        baselineUsedMinutes: baseline,
      })
    ).toBe(102);
    expect(268 - baseline).toBe(18);
  });
});

describe("getEvaluationStatusLabel", () => {
  it("shows Bonus time for after-hours allowed bonus sessions", () => {
    expect(
      getEvaluationStatusLabel({
        status: "allowed",
        inWindow: false,
        bonusMinutes: 60,
        remainingMinutes: 35,
      })
    ).toBe("Bonus time");
    expect(
      isAfterHoursBonusActive({
        status: "allowed",
        inWindow: false,
        bonusMinutes: 60,
        remainingMinutes: 35,
      })
    ).toBe(true);
  });

  it("keeps Within limits inside the window even with banked bonus", () => {
    expect(
      getEvaluationStatusLabel({
        status: "allowed",
        inWindow: true,
        bonusMinutes: 60,
        remainingMinutes: 40,
      })
    ).toBe("Within limits");
  });

  it("keeps Outside allowed hours when bonus is exhausted", () => {
    expect(
      getEvaluationStatusLabel({
        status: "outside_window",
        inWindow: false,
        bonusMinutes: 60,
        remainingMinutes: 0,
      })
    ).toBe("Outside allowed hours");
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
