"use client";

import type { AllowedWindow } from "@warden/shared";
import { DEFAULT_TIME_ZONE, getZonedTimeParts } from "@warden/shared";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@warden/ui";
import { formatTimeRange12 } from "@/lib/time-format";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

function timeStringToDate(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function dateToTimeString(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

type Preset = {
  id: string;
  label: string;
  windows: AllowedWindow[];
};

const PRESETS: Preset[] = [
  {
    id: "weekdays",
    label: `Weekdays ${formatTimeRange12("15:00", "20:00")}`,
    windows: [1, 2, 3, 4, 5].map((day) => ({
      day,
      start: "15:00",
      end: "20:00",
    })),
  },
  {
    id: "weekends",
    label: `Weekends ${formatTimeRange12("09:00", "21:00")}`,
    windows: [6, 7].map((day) => ({
      day,
      start: "09:00",
      end: "21:00",
    })),
  },
  {
    id: "school-nights",
    label: `School nights ${formatTimeRange12("15:00", "20:00")}`,
    windows: [1, 2, 3, 4].map((day) => ({
      day,
      start: "15:00",
      end: "20:00",
    })),
  },
  {
    id: "clear",
    label: "Any time",
    windows: [],
  },
];

function parseTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function windowsForDay(windows: AllowedWindow[], day: number) {
  return windows.filter((window) => window.day === day);
}

function replaceDayWindows(
  windows: AllowedWindow[],
  day: number,
  dayWindows: AllowedWindow[]
) {
  return [
    ...windows.filter((window) => window.day !== day),
    ...dayWindows.map((window) => ({ ...window, day })),
  ].sort((a, b) => a.day - b.day || parseTime(a.start) - parseTime(b.start));
}

function DayTimeline({ start, end }: { start: string; end: string }) {
  const startMin = parseTime(start);
  const endMin = parseTime(end);
  const left = (Math.min(startMin, endMin) / (24 * 60)) * 100;
  const width =
    (Math.max(1, Math.abs(endMin - startMin)) / (24 * 60)) * 100;

  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="absolute inset-y-0 rounded-full bg-primary/70"
        style={{ left: `${left}%`, width: `${width}%` }}
      />
    </div>
  );
}

type AllowedWindowsEditorProps = {
  windows: AllowedWindow[];
  onChange: (windows: AllowedWindow[]) => void;
  timeZone?: string;
};

export function AllowedWindowsEditor({
  windows,
  onChange,
  timeZone,
}: AllowedWindowsEditorProps) {
  const todayDay = getZonedTimeParts(
    new Date(),
    timeZone ?? DEFAULT_TIME_ZONE
  ).dayOfWeek;
  const toggleDay = (day: number, enabled: boolean) => {
    if (!enabled) {
      onChange(windows.filter((window) => window.day !== day));
      return;
    }

    const existing = windowsForDay(windows, day);
    if (existing.length > 0) return;

    onChange(
      replaceDayWindows(windows, day, [{ day, start: "15:00", end: "20:00" }])
    );
  };

  const updateDayWindow = (
    day: number,
    index: number,
    field: "start" | "end",
    value: string
  ) => {
    const dayWindows = [...windowsForDay(windows, day)];
    if (!dayWindows[index]) return;
    dayWindows[index] = { ...dayWindows[index], [field]: value };
    onChange(replaceDayWindows(windows, day, dayWindows));
  };

  const addDayWindow = (day: number) => {
    const dayWindows = windowsForDay(windows, day);
    onChange(
      replaceDayWindows(windows, day, [
        ...dayWindows,
        { day, start: "15:00", end: "20:00" },
      ])
    );
  };

  const removeDayWindow = (day: number, index: number) => {
    const dayWindows = windowsForDay(windows, day).filter((_, i) => i !== index);
    onChange(replaceDayWindows(windows, day, dayWindows));
  };

  const applyPreset = (preset: Preset) => {
    onChange(preset.windows.map((window) => ({ ...window })));
  };

  const activePresetId = PRESETS.find((preset) => {
    if (preset.windows.length !== windows.length) return false;
    return preset.windows.every((presetWindow) =>
      windows.some(
        (window) =>
          window.day === presetWindow.day &&
          window.start === presetWindow.start &&
          window.end === presetWindow.end
      )
    );
  })?.id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activePresetId === preset.id
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {windows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          No windows set — allowed any time (within daily limit). Turn on days
          below or pick a preset.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DAYS.map((day) => {
          const dayWindows = windowsForDay(windows, day.value);
          const enabled = dayWindows.length > 0;
          const isToday = day.value === todayDay;

          return (
            <div
              key={day.value}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "space-y-2 rounded-lg px-3 py-2.5",
                isToday ? "allowed-windows-day-today" : "border border-border/70",
                enabled ? "bg-card" : "bg-muted/10"
              )}
            >
              <div className="flex items-start gap-3">
                <label className="flex min-w-[3.5rem] cursor-pointer items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggleDay(day.value, e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <span className="flex flex-col leading-tight">
                    <span className="text-sm font-medium">{day.label}</span>
                    {isToday ? (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        Today
                      </span>
                    ) : null}
                  </span>
                </label>

                {enabled ? (
                  <div className="min-w-0 flex-1 space-y-2">
                    {dayWindows.map((window, index) => (
                      <div
                        key={`${day.value}-${index}`}
                        className="space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <TimePicker
                            value={timeStringToDate(window.start)}
                            aria-label={`${day.label} start time`}
                            use12HourFormat
                            modal
                            onChange={(date) =>
                              updateDayWindow(
                                day.value,
                                index,
                                "start",
                                dateToTimeString(date)
                              )
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            to
                          </span>
                          <TimePicker
                            value={timeStringToDate(window.end)}
                            aria-label={`${day.label} end time`}
                            use12HourFormat
                            modal
                            onChange={(date) =>
                              updateDayWindow(
                                day.value,
                                index,
                                "end",
                                dateToTimeString(date)
                              )
                            }
                          />
                          {dayWindows.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${day.label} window ${index + 1}`}
                              onClick={() => removeDayWindow(day.value, index)}
                            >
                              ×
                            </Button>
                          )}
                        </div>
                        <DayTimeline start={window.start} end={window.end} />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addDayWindow(day.value)}
                      className="text-xs text-primary hover:underline"
                    >
                      + Add another window
                    </button>
                  </div>
                ) : (
                  <p className="flex-1 pt-1 text-xs text-muted-foreground">
                    {windows.length === 0
                      ? "Follows any-time policy"
                      : "No access this day"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { DAYS as ALLOWED_WINDOW_DAYS };
