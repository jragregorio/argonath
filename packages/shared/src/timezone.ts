/** Default when a family has no timezone configured. */
export const DEFAULT_TIME_ZONE = "UTC";

const WEEKDAY_TO_DAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export type ZonedTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** ISO weekday: 1=Monday … 7=Sunday */
  dayOfWeek: number;
  minutesSinceMidnight: number;
};

/**
 * Returns true if `timeZone` is a valid IANA zone for Intl.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 100) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wall-clock parts of `date` in `timeZone` (falls back to UTC if invalid).
 */
export function getZonedTimeParts(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): ZonedTimeParts {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const dayOfWeek = WEEKDAY_TO_DAY[parts.weekday] ?? 1;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute,
    dayOfWeek,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

/**
 * Calendar date in `timeZone` as a UTC-midnight Date suitable for Prisma `@db.Date`.
 */
export function getCalendarDateInTimeZone(
  date: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE
): Date {
  const { year, month, day } = getZonedTimeParts(date, timeZone);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Curated IANA zones for settings UI (plus any saved custom value).
 */
export const COMMON_TIME_ZONES: readonly string[] = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Warsaw",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;
