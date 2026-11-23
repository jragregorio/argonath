import { describe, expect, it } from "vitest";
import {
  CHILD_MESSAGE_MAX_PER_HOUR,
  checkChildMessageRateLimit,
  childMessagePushTag,
  resolveChildMessageText,
} from "./types";

const now = new Date("2026-11-24T12:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("resolveChildMessageText", () => {
  it("prefers trimmed typed text", () => {
    expect(resolveChildMessageText("done", "  can I have a snack? ")).toBe(
      "can I have a snack?"
    );
  });

  it("falls back to the quick label", () => {
    expect(resolveChildMessageText("come_here", "   ")).toBe("Can you come here?");
    expect(resolveChildMessageText("need_help", null)).toBe("Need help");
  });

  it("returns null when nothing usable", () => {
    expect(resolveChildMessageText(null, "")).toBeNull();
    expect(resolveChildMessageText("bogus", null)).toBeNull();
  });

  it("caps typed text at 200 chars", () => {
    expect(resolveChildMessageText(null, "x".repeat(250))).toHaveLength(200);
  });
});

describe("checkChildMessageRateLimit", () => {
  it("allows the first message", () => {
    expect(checkChildMessageRateLimit([], now)).toEqual({ ok: true });
  });

  it("blocks a second message inside 30s and says how long to wait", () => {
    expect(checkChildMessageRateLimit([ago(10)], now)).toEqual({
      ok: false,
      retryAfterSeconds: 20,
    });
  });

  it("allows again after 30s", () => {
    expect(checkChildMessageRateLimit([ago(30)], now)).toEqual({ ok: true });
  });

  it("blocks at 20 per rolling hour until the oldest ages out", () => {
    // 20 messages, one every 2 minutes, oldest 40 min ago… newest 2 min ago.
    const sent = Array.from({ length: CHILD_MESSAGE_MAX_PER_HOUR }, (_, i) =>
      ago(120 * (i + 1))
    );
    const result = checkChildMessageRateLimit(sent, now);
    expect(result.ok).toBe(false);
    // Oldest is 2400s ago → frees up in 3600 - 2400 = 1200s.
    expect(result).toEqual({ ok: false, retryAfterSeconds: 1200 });
  });

  it("ignores messages older than an hour", () => {
    const sent = Array.from({ length: 25 }, (_, i) => ago(3601 + i));
    expect(checkChildMessageRateLimit(sent, now)).toEqual({ ok: true });
  });
});

describe("childMessagePushTag", () => {
  it("is stable per message", () => {
    expect(childMessagePushTag("m1")).toBe("child-message:m1");
  });
});
