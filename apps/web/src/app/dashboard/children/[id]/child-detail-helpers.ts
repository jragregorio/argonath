import type { AllowedWindow, PolicyStatus } from "@warden/shared";

export const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

export type CaptureFeedback = {
  message: string;
  tone: "pending" | "success" | "error";
};

export type PairingCodeState = {
  code: string;
  expiresAt: Date;
  deviceId: string;
};

export function windowsEqual(a: AllowedWindow[], b: AllowedWindow[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (window, i) =>
      window.day === b[i].day &&
      window.start === b[i].start &&
      window.end === b[i].end
  );
}

export function formatDayRange(days: number[]): string {
  if (days.length === 0) return "";
  const sorted = [...days].sort((a, b) => a - b);
  const labels = sorted.map(
    (day) => DAYS.find((d) => d.value === day)?.label ?? `Day ${day}`
  );
  const ranges: string[] = [];
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const contiguous =
      i < sorted.length && sorted[i] === sorted[i - 1] + 1;
    if (!contiguous) {
      if (i - 1 === start) {
        ranges.push(labels[start]);
      } else if (i - 1 === start + 1) {
        ranges.push(`${labels[start]}, ${labels[i - 1]}`);
      } else {
        ranges.push(`${labels[start]}-${labels[i - 1]}`);
      }
      start = i;
    }
  }
  return ranges.join(", ");
}

/** Group constrained days by capacity for accurate advisory copy. */
export function formatReachAdvisory(
  constrainedDays: number[],
  byDay: { day: number; capacityMinutes: number }[],
  dailyLimitMinutes: number
): string {
  const capacityByDay = new Map(
    byDay.map((d) => [d.day, d.capacityMinutes] as const)
  );
  const byCapacity = new Map<number, number[]>();
  for (const day of constrainedDays) {
    const capacity = capacityByDay.get(day) ?? 0;
    const list = byCapacity.get(capacity) ?? [];
    list.push(day);
    byCapacity.set(capacity, list);
  }
  const groups = [...byCapacity.entries()].sort((a, b) => a[0] - b[0]);

  if (groups.length === 1) {
    const [capacity, days] = groups[0];
    return `On ${formatDayRange(days)} these hours only allow ${capacity} of the ${dailyLimitMinutes} minutes/day you've set.`;
  }

  const clauses = groups.map(([capacity, days], index) => {
    const range = formatDayRange(days);
    if (index === 0) {
      return `On ${range} these hours allow only ${capacity} min`;
    }
    return `on ${range} ${capacity} min`;
  });
  const joined =
    clauses.length === 2
      ? `${clauses[0]}, and ${clauses[1]}`
      : `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
  return `${joined}, of the ${dailyLimitMinutes} minutes/day you've set.`;
}

export function progressBarClass(status: PolicyStatus) {
  if (status === "blocked") return "bg-destructive";
  if (status === "outside_window") return "bg-yellow-500";
  return "bg-primary";
}

export function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function captureToneClass(tone: CaptureFeedback["tone"]) {
  if (tone === "success") return "text-green-400";
  if (tone === "error") return "text-destructive";
  return "text-muted-foreground";
}
