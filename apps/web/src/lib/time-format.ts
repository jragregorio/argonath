import type { AllowedWindow } from "@warden/shared";

const DAY_LABELS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

/** Format `"HH:mm"` (24h storage) as 12-hour clock with AM/PM. */
export function formatTime12(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;

  let hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return time;

  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${period}`;
}

export function formatTimeRange12(start: string, end: string): string {
  return `${formatTime12(start)} – ${formatTime12(end)}`;
}

/**
 * Replace the first `H:mm` / `HH:mm` token in engine strings like
 * `"Mon 15:00"` or `"Not available until Mon 15:00"`.
 */
export function formatClockInText(text: string): string {
  return text.replace(/\b(\d{1,2}:\d{2})\b/, (_, clock: string) =>
    formatTime12(clock)
  );
}

export function formatWindowsSummary(windows: AllowedWindow[]): string {
  if (windows.length === 0) {
    return "Allowed any time (within daily limit)";
  }

  const byRange = new Map<string, number[]>();
  for (const window of windows) {
    const key = `${window.start}|${window.end}`;
    const days = byRange.get(key) ?? [];
    days.push(window.day);
    byRange.set(key, days);
  }

  return [...byRange.entries()]
    .map(([key, days]) => {
      const [start, end] = key.split("|");
      const labels = days
        .sort((a, b) => a - b)
        .map((day) => DAY_LABELS[day] ?? `Day ${day}`);
      return `${labels.join(", ")} ${formatTimeRange12(start, end)}`;
    })
    .join(" · ");
}
