"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { Clock } from "lucide-react";
import { cn } from "@warden/ui";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useIsDesktopMd } from "@/lib/use-is-desktop-md";

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
  minuteStep?: number;
};

function buildMinuteOptions(step: number, currentMinute: number): number[] {
  const options: number[] = [];
  for (let m = 0; m < 60; m += step) {
    options.push(m);
  }
  if (!options.includes(currentMinute)) {
    options.push(currentMinute);
    options.sort((a, b) => a - b);
  }
  return options;
}
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
  scrollOnOpen?: boolean;
  listClassName?: string;
  size?: "compact" | "comfortable";
};

function TimeColumn({
  label,
  options,
  value,
  onSelect,
  isOptionDisabled,
  scrollOnOpen,
  listClassName,
  size = "compact",
}: TimeColumnProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const comfortable = size === "comfortable";

  useEffect(() => {
    if (!scrollOnOpen) return;
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, [value, scrollOnOpen]);

  return (
    <div className={cn("flex flex-col", comfortable && "min-w-0 flex-1")}>
      <div
        className={cn(
          "border-b border-border text-center font-medium whitespace-nowrap text-muted-foreground",
          comfortable ? "px-3 py-2.5 text-base" : "px-2 py-1.5 text-xs"
        )}
      >
        {label}
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        className={cn(
          "flex flex-col overflow-y-auto overscroll-contain p-1",
          comfortable ? "h-80 w-full" : "h-48 w-14",
          listClassName,
          "[scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]",
          "[&::-webkit-scrollbar]:w-1.5",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
        )}
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
                "rounded-md tabular-nums transition-colors",
                comfortable
                  ? "min-h-[4.5rem] px-3 py-3 text-2xl font-medium"
                  : "px-2 py-1.5 text-sm",
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
  minuteStep = 1,
}: TimePickerProps) {
  const isDesktop = useIsDesktopMd();
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
  const minuteOptions = buildMinuteOptions(minuteStep, minute);
  const columnSize = isDesktop ? "compact" : "comfortable";
  const steppedListClassName =
    isDesktop && minuteStep > 1 ? "h-44" : undefined;

  useEffect(() => {
    if (!open || isDesktop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isDesktop]);

  const pickerColumns = (
    <div className={cn("flex divide-x divide-border", !isDesktop && "w-full")}>
      <TimeColumn
        label="Hour"
        options={hourOptions}
        value={hour}
        size={columnSize}
        scrollOnOpen={open}
        listClassName={steppedListClassName}
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
        options={minuteOptions}
        value={minute}
        size={columnSize}
        scrollOnOpen={open}
        listClassName={steppedListClassName}
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
          label="AM/PM"
          options={AMPM_OPTIONS}
          value={ampm}
          size={columnSize}
          scrollOnOpen={open}
          listClassName={steppedListClassName}
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
  );

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
      className={cn(
        "min-h-12 min-w-[7rem] justify-start gap-2 px-2 font-normal md:h-10 md:min-h-10",
        "border-foreground/25 bg-background md:border-border md:bg-transparent",
        hasError && "border-destructive",
        className
      )}
    >
      <Clock className="hidden h-4 w-4 shrink-0 opacity-50 md:block" />
      <span className="tabular-nums text-lg md:text-sm">{displayText}</span>
    </Button>
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen} modal={modal}>
        <PopoverAnchor asChild>
          <span className="inline-flex">{trigger}</span>
        </PopoverAnchor>
        <PopoverContent className="w-auto p-0" align="start">
          {pickerColumns}
        </PopoverContent>
      </Popover>
    );
  }

  const mobileDialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="Dismiss time picker"
              className="fixed inset-0 z-[80] bg-black/50"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel ?? "Choose time"}
              className="fixed inset-x-4 top-1/2 z-[80] -translate-y-1/2 rounded-xl border border-border bg-card p-3 shadow-xl"
            >
              {pickerColumns}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <span className="inline-flex w-full">{trigger}</span>
      {mobileDialog}
    </>
  );
}
