"use client";

import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isSameDay,
  isBefore,
  isAfter,
  startOfDay
} from "date-fns";

export type DayStatus = "available" | "booked" | "blocked" | "checkin" | "checkout" | "selected" | "in-range";

export type CalendarDay = {
  date: Date;
  status: DayStatus;
  label?: string; // e.g. guest name for admin view
  color?: string; // for differentiating bookings
};

type CalendarProps = {
  days: CalendarDay[];
  onDateClick?: (date: Date) => void;
  selectedRange?: { start: Date | null; end: Date | null };
  minDate?: Date;
  showLegend?: boolean;
  monthsToShow?: number;
};

const STATUS_STYLES: Record<DayStatus, string> = {
  available: "bg-paper text-ink hover:bg-sage/10 cursor-pointer",
  booked: "bg-brick/15 text-brick",
  blocked: "bg-line/60 text-ink/30 line-through",
  checkin: "bg-brick/15 text-brick rounded-l-full",
  checkout: "bg-brick/15 text-brick rounded-r-full",
  selected: "bg-ink text-paper",
  "in-range": "bg-ink/10 text-ink"
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar({
  days,
  onDateClick,
  selectedRange,
  minDate,
  showLegend = true,
  monthsToShow = 2
}: CalendarProps) {
  const [baseMonth, setBaseMonth] = useState(startOfMonth(new Date()));

  const getStatus = (date: Date): { status: DayStatus; label?: string; color?: string } => {
    // Check selected range first
    if (selectedRange) {
      if (selectedRange.start && isSameDay(date, selectedRange.start)) {
        return { status: "selected" };
      }
      if (selectedRange.end && isSameDay(date, selectedRange.end)) {
        return { status: "selected" };
      }
      if (
        selectedRange.start &&
        selectedRange.end &&
        isAfter(date, selectedRange.start) &&
        isBefore(date, selectedRange.end)
      ) {
        return { status: "in-range" };
      }
    }

    // Check provided day statuses
    const day = days.find((d) => isSameDay(d.date, date));
    if (day) {
      return { status: day.status, label: day.label, color: day.color };
    }

    // Past dates
    if (minDate && isBefore(date, startOfDay(minDate))) {
      return { status: "blocked" };
    }

    return { status: "available" };
  };

  const renderMonth = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);

    const weeks: Date[][] = [];
    let cursor = calStart;
    while (cursor <= calEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(cursor);
        cursor = addDays(cursor, 1);
      }
      weeks.push(week);
    }

    return (
      <div key={monthDate.toISOString()} className="flex-1 min-w-[280px]">
        <h3 className="text-center font-display text-sm mb-3">
          {format(monthDate, "MMMM yyyy")}
        </h3>
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center text-[10px] text-ink/40 font-mono pb-2">
              {day}
            </div>
          ))}
          {weeks.map((week, wi) =>
            week.map((date, di) => {
              const inMonth = isSameMonth(date, monthDate);
              const { status, label } = getStatus(date);
              const isClickable = onDateClick && inMonth && status === "available";

              return (
                <div
                  key={`${wi}-${di}`}
                  className={`relative aspect-square flex items-center justify-center text-xs rounded-sm transition-colors ${
                    inMonth ? STATUS_STYLES[status] : "text-ink/10"
                  } ${isClickable ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if (isClickable) onDateClick(date);
                  }}
                  title={label || format(date, "MMM d, yyyy")}
                >
                  {inMonth && format(date, "d")}
                  {label && inMonth && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brick" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const months = Array.from({ length: monthsToShow }, (_, i) => addMonths(baseMonth, i));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setBaseMonth(subMonths(baseMonth, 1))}
          className="text-sm text-ink/60 hover:text-ink px-2 py-1"
        >
          ← Prev
        </button>
        <button
          onClick={() => setBaseMonth(addMonths(baseMonth, 1))}
          className="text-sm text-ink/60 hover:text-ink px-2 py-1"
        >
          Next →
        </button>
      </div>

      <div className="flex gap-6 flex-wrap">
        {months.map((m) => renderMonth(m))}
      </div>

      {showLegend && (
        <div className="flex gap-4 mt-4 text-[10px] text-ink/50 font-mono">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-paper border border-line" /> Available
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-brick/15" /> Booked
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-line/60" /> Blocked
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-ink" /> Selected
          </span>
        </div>
      )}
    </div>
  );
}
