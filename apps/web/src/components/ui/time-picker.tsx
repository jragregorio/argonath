"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { format, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { Clock } from "lucide-react";
import { cn } from "@warden/ui";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

type AmPm = "AM" | "PM";

type TimePickerProps = {
  value: Date;
  onChange: (date: Date) => void;
  use12HourFormat?: boolean;
  min?: Date;
  max?: Date;
  disabled?: boolean;
  modal?: boolean;
  hasError?: boolean;
  className?: string;
  "aria-label"?: string;
};

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i);
const HOUR_OPTIONS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOUR_OPTIONS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const AMPM_OPTIONS: AmPm[] = ["AM", "PM"];

function timesEqual(a: Date, b: Date): boolean {
  return a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes();
}

function dateToParts(date: Date, use12HourFormat: boolean) {
  const hours24 = date.getHours();
  const minutes = date.getMinutes();

  if (!use12HourFormat) {
    return { hour: hours24, minute: minutes, ampm: undefined as AmPm | undefined };
  }

  const ampm: AmPm = hours24 >= 12 ? "PM" : "AM";
  let hour = hours24 % 12;
  if (hour === 0) hour = 12;
  return { hour, minute: minutes, ampm };
}

function buildTime(
  base: Date,
  hour: number,
  minute: number,
  use12HourFormat: boolean,
  ampm?: AmPm
): Date {
  let hours24 = hour;

  if (use12HourFormat && ampm) {
    hours24 = hour % 12;
    if (ampm === "PM") hours24 += 12;
  }

  return setMilliseconds(
    setSeconds(setMinutes(setHours(new Date(base), hours24), minute), 0),
    0
  );
}

function timeValueMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function isTimeDisabled(
  candidate: Date,
  min?: Date,
  max?: Date
): boolean {
  const candidateMinutes = timeValueMinutes(candidate);
  if (min && candidateMinutes < timeValueMinutes(min)) return true;
  if (max && candidateMinutes > timeValueMinutes(max)) return true;
  return false;
}

type TimeColumnProps = {
  label: string;
  options: (string | number)[];
  value: string | number;
  onSelect: (value: string | number) => void;
  isOptionDisabled?: (option: string | number) => boolean;
};

function TimeColumn({
  label,
  options,
  value,
  onSelect,
  isOptionDisabled,
}: TimeColumnProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, [value]);

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <ScrollArea className="h-48 w-14">
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="flex flex-col p-1"
        >
          {options.map((option) => {
            const selected = option === value;
            const optionDisabled = isOptionDisabled?.(option) ?? false;
            const display =
              typeof option === "number"
                ? option.toString().padStart(2, "0")
                : option;

            return (
              <button
                key={String(option)}
                ref={selected ? selectedRef : undefined}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={optionDisabled}
                onClick={() => onSelect(option)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm tabular-nums transition-colors",
                  "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "bg-primary text-primary-foreground hover:bg-primary",
                  optionDisabled && "pointer-events-none opacity-40"
                )}
              >
                {display}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function TimePicker({
  value,
  onChange,
  use12HourFormat = false,
  min,
  max,
  disabled = false,
  modal = false,
  hasError = false,
  className,
  "aria-label": ariaLabel,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const initial = dateToParts(value, use12HourFormat);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [ampm, setAmpm] = useState<AmPm>(initial.ampm ?? "AM");

  const valueMinutesKey = value.getHours() * 60 + value.getMinutes();

  useEffect(() => {
    const parts = dateToParts(value, use12HourFormat);
    setHour(parts.hour);
    setMinute(parts.minute);
    if (parts.ampm) setAmpm(parts.ampm);
  }, [valueMinutesKey, use12HourFormat, value]);

  const commitTime = useCallback(
    (nextHour: number, nextMinute: number, nextAmpm?: AmPm) => {
      const built = buildTime(
        value,
        nextHour,
        nextMinute,
        use12HourFormat,
        use12HourFormat ? nextAmpm ?? ampm : undefined
      );

      if (!timesEqual(built, value)) {
        onChange(built);
      }
    },
    [ampm, onChange, use12HourFormat, value]
  );

  const isCandidateDisabled = useCallback(
    (candidateHour: number, candidateMinute: number, candidateAmpm?: AmPm) => {
      const candidate = buildTime(
        value,
        candidateHour,
        candidateMinute,
        use12HourFormat,
        use12HourFormat ? candidateAmpm ?? ampm : undefined
      );
      return isTimeDisabled(candidate, min, max);
    },
    [ampm, max, min, use12HourFormat, value]
  );

  const displayFormat = use12HourFormat ? "hh:mm a" : "HH:mm";
  const displayText = format(value, displayFormat);

  const hourOptions = use12HourFormat ? HOUR_OPTIONS_12 : HOUR_OPTIONS_24;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverAnchor asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className={cn(
              "h-10 min-h-10 min-w-[7rem] justify-start gap-2 px-2 font-normal",
              hasError && "border-destructive",
              className
            )}
          >
            <Clock className="h-4 w-4 shrink-0 opacity-50" />
            <span className="tabular-nums">{displayText}</span>
          </Button>
        </span>
      </PopoverAnchor>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex divide-x divide-border">
          <TimeColumn
            label="Hour"
            options={hourOptions}
            value={hour}
            onSelect={(next) => {
              const nextHour = next as number;
              setHour(nextHour);
              commitTime(nextHour, minute, ampm);
            }}
            isOptionDisabled={(option) =>
              isCandidateDisabled(option as number, minute, ampm)
            }
          />
          <TimeColumn
            label="Min"
            options={MINUTE_OPTIONS}
            value={minute}
            onSelect={(next) => {
              const nextMinute = next as number;
              setMinute(nextMinute);
              commitTime(hour, nextMinute, ampm);
            }}
            isOptionDisabled={(option) =>
              isCandidateDisabled(hour, option as number, ampm)
            }
          />
          {use12HourFormat ? (
            <TimeColumn
              label=""
              options={AMPM_OPTIONS}
              value={ampm}
              onSelect={(next) => {
                const nextAmpm = next as AmPm;
                setAmpm(nextAmpm);
                commitTime(hour, minute, nextAmpm);
              }}
              isOptionDisabled={(option) =>
                isCandidateDisabled(hour, minute, option as AmPm)
              }
            />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
