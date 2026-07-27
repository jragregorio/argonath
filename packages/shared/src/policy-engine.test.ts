import { describe, it, expect } from "vitest";
import { evaluatePolicy, shouldLock } from "./policy-engine";
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

  it("blocks outside allowed window", () => {
    const policy: ScreenTimePolicyInput = {
      dailyLimitMinutes: 120,
      allowedWindows: [{ day: 1, start: "22:00", end: "23:00" }],
      isActive: true,
    };
    const mondayNoon = new Date("2026-01-05T12:00:00");
    const result = evaluatePolicy(policy, 0, [], mondayNoon);
    expect(result.status).toBe("outside_window");
    expect(shouldLock(result)).toBe(true);
  });
});
