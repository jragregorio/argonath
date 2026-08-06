function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(date: Date, now: Date) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameCalendarDay(date, yesterday);
}

export function formatAbsoluteTime(
  value: Date | string | null | undefined
): string {
  if (!value) return "—";
  return toDate(value).toLocaleString();
}

export function formatRelativeTime(
  value: Date | string | null | undefined
): string {
  if (!value) return "—";

  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    return date.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60 && isSameCalendarDay(date, now)) {
    return `${diffMin}m ago`;
  }

  if (isSameCalendarDay(date, now)) {
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ago`;
  }

  if (isYesterday(date, now)) {
    return `Yesterday ${date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}
