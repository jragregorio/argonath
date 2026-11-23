import { describe, expect, it } from "vitest";
import { formatNudgeReplyMessage, nudgeReplyPushTag } from "./types";

describe("formatNudgeReplyMessage", () => {
  it("quotes typed text and lets it win over the canned label", () => {
    expect(formatNudgeReplyMessage("Mia", "on_my_way", "  brb 5 min ")).toBe(
      'Mia replied: "brb 5 min"'
    );
  });

  it("uses the canned label when nothing was typed", () => {
    expect(formatNudgeReplyMessage("Mia", "on_my_way", null)).toBe(
      "Mia replied: On my way"
    );
    expect(formatNudgeReplyMessage("Mia", "need_a_few", "   ")).toBe(
      "Mia replied: Need a few minutes"
    );
  });

  it("falls back to OK for unknown or missing responses", () => {
    expect(formatNudgeReplyMessage("Mia", null, null)).toBe("Mia replied: OK");
  });
});

describe("nudgeReplyPushTag", () => {
  it("is stable per nudge", () => {
    expect(nudgeReplyPushTag("abc")).toBe("nudge-reply:abc");
  });
});
