import { describe, it, expect } from "vitest";
import { sanitizeRunningApps } from "./running-apps";

describe("sanitizeRunningApps", () => {
  it("returns empty for non-array input", () => {
    expect(sanitizeRunningApps(null)).toEqual([]);
    expect(sanitizeRunningApps("bad")).toEqual([]);
  });

  it("drops invalid rows and trims/caps strings", () => {
    const longName = "a".repeat(200);
    const longTitle = "b".repeat(300);
    const result = sanitizeRunningApps([
      { processName: " chrome ", title: " Tab ", isForeground: true },
      { processName: longName, title: longTitle, isForeground: false },
      { processName: "", title: "x" },
      { title: "no name" },
    ]);
    expect(result).toEqual([
      {
        processName: "chrome",
        title: "Tab",
        isForeground: true,
      },
      {
        processName: "a".repeat(128),
        title: "b".repeat(256),
        isForeground: false,
      },
    ]);
  });

  it("keeps at most one foreground app", () => {
    const result = sanitizeRunningApps([
      { processName: "a", title: "A", isForeground: true },
      { processName: "b", title: "B", isForeground: true },
    ]);
    expect(result).toEqual([
      { processName: "a", title: "A", isForeground: true },
      { processName: "b", title: "B", isForeground: false },
    ]);
  });

  it("caps at 40 apps", () => {
    const input = Array.from({ length: 50 }, (_, i) => ({
      processName: `p${i}`,
      title: `t${i}`,
      isForeground: false,
    }));
    expect(sanitizeRunningApps(input).length).toBe(40);
  });
});
