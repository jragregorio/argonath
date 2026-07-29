"use client";

import type { AllowedWindow } from "@warden/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@warden/ui";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

const TIME_OPTIONS: string[] = (() => {
  const options: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
    const h = Math.floor(minutes / 60)
      .toString()
      .padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    options.push(`${h}:${m}`);
  }
  return options;
})();

type Preset = {
  id: string;
  label: string;
  windows: AllowedWindow[];
};

const PRESETS: Preset[] = [
  {
    id: "weekdays",
    label: "Weekdays 15:00–20:00",
    windows: [1, 2, 3, 4, 5].map((day) => ({
      day,
      start: "15:00",
      end: "20:00",
    })),
  },
  {
    id: "weekends",
    label: "Weekends 09:00–21:00",
    windows: [6, 7].map((day) => ({
      day,
      start: "09:00",
      end: "21:00",
    })),
  },
  {
    id: "school-nights",
    label: "School nights 15:00–20:00",
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

function ensureTimeOption(time: string): string[] {
  if (TIME_OPTIONS.includes(time)) return TIME_OPTIONS;
  return [...TIME_OPTIONS, time].sort((a, b) => parseTime(a) - parseTime(b));
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
    <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
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
};

export function AllowedWindowsEditor({
  windows,
  onChange,
}: AllowedWindowsEditorProps) {
  const toggleDay = (day: number, enabled: boolean) => {
    if (!enabled) {
      onChange(windows.filter((window) => window.day !== day));
      return;
    }

    const existing = windowsForDay(windows, day);
    if (existing.length > 0) return;

    onChange(
      replaceDayWindows(windows, day, [
        { day, start: "15:00", end: "20:00" },
      ])
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
      <div className="flex items-center justify-between gap-2">
        <Label>Allowed windows</Label>
      </div>

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
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {windows.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-3">
          No windows set — allowed any time (within daily limit). Turn on days
          below or pick a preset.
        </p>
      ) : null}

      <div className="space-y-2">
        {DAYS.map((day) => {
          const dayWindows = windowsForDay(windows, day.value);
          const enabled = dayWindows.length > 0;

          return (
            <div
              key={day.value}
              className={cn(
                "rounded-lg border border-border/70 px-3 py-2.5 space-y-2",
                enabled ? "bg-card" : "bg-muted/10"
              )}
            >
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 min-w-[4.5rem] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggleDay(day.value, e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">{day.label}</span>
                </label>

                {enabled ? (
                  <div className="flex-1 min-w-0 space-y-2">
                    {dayWindows.map((window, index) => (
                      <div key={`${day.value}-${index}`} className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={window.start}
                            onChange={(e) =>
                              updateDayWindow(
                                day.value,
                                index,
                                "start",
                                e.target.value
                              )
                            }
                            className="h-10 rounded-lg border border-border bg-background px-2 text-sm min-w-[5.5rem]"
                          >
                            {ensureTimeOption(window.start).map((time) => (
                              <option key={time} value={time}>
                                {time}
                              </option>
                            ))}
                          </select>
                          <span className="text-muted-foreground text-sm">
                            to
                          </span>
                          <select
                            value={window.end}
                            onChange={(e) =>
                              updateDayWindow(
                                day.value,
                                index,
                                "end",
                                e.target.value
                              )
                            }
                            className="h-10 rounded-lg border border-border bg-background px-2 text-sm min-w-[5.5rem]"
                          >
                            {ensureTimeOption(window.end).map((time) => (
                              <option key={time} value={time}>
                                {time}
                              </option>
                            ))}
                          </select>
                          {dayWindows.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
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
                  <p className="text-xs text-muted-foreground flex-1">
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
