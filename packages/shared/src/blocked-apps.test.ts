import { describe, it, expect } from "vitest";
import {
  NEVER_BLOCK_PROCESS_NAMES,
  sanitizeBlockedProcessNames,
} from "./blocked-apps";

describe("sanitizeBlockedProcessNames", () => {
  it("returns empty for non-array input", () => {
    expect(sanitizeBlockedProcessNames(null)).toEqual([]);
    expect(sanitizeBlockedProcessNames("bad")).toEqual([]);
  });

  it("drops never-kill names", () => {
    const result = sanitizeBlockedProcessNames([
      "chrome",
      "Warden.Tray",
      "EXPLORER",
      "notepad",
    ]);
    expect(result).toEqual(["chrome", "notepad"]);
    expect(NEVER_BLOCK_PROCESS_NAMES).toContain("explorer");
  });

  it("trim, drop empty, cap length", () => {
    const longName = "a".repeat(200);
    const result = sanitizeBlockedProcessNames([
      " chrome ",
      "",
      "   ",
      longName,
    ]);
    expect(result).toEqual(["chrome", "a".repeat(128)]);
  });

  it("case-insensitive dedupe keeps first casing", () => {
    const result = sanitizeBlockedProcessNames([
      "Chrome",
      "CHROME",
      "chrome",
      "Notepad",
    ]);
    expect(result).toEqual(["Chrome", "Notepad"]);
  });

  it("caps at 40 names", () => {
    const input = Array.from({ length: 50 }, (_, i) => `app${i}`);
    expect(sanitizeBlockedProcessNames(input).length).toBe(40);
  });
});
