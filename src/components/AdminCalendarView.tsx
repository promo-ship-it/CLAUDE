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
  isWithinInterval,
  parseISO
} from "date-fns";

type BookingEvent = {
  id: string;
  propertyId: string;
  propertyName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  type: "booking";
};

type BlockedEvent = {
  id: string;
  propertyId: string;
  propertyName: string;
  date: string;
  source: string;
  type: "blocked";
};

type PropertyInfo = {
  id: string;
  name: string;
  color: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AdminCalendarView({
  events,
  blocks,
  properties
}: {
  events: BookingEvent[];
  blocks: BlockedEvent[];
  properties: PropertyInfo[];
}) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedProperty, setSelectedProperty] = useState<string | "all">("all");

  const filteredEvents = selectedProperty === "all"
    ? events
    : events.filter((e) => e.propertyId === selectedProperty);

  const filteredBlocks = selectedProperty === "all"
    ? blocks
    : blocks.filter((b) => b.propertyId === selectedProperty);

  const getColorForProperty = (propertyId: string): string => {
    return properties.find((p) => p.id === propertyId)?.color || "#A65A3D";
  };

  const getEventsForDate = (date: Date) => {
    const bookingsOnDate = filteredEvents.filter((e) => {
      const checkIn = parseISO(e.checkIn);
      const checkOut = parseISO(e.checkOut);
      // A booking covers this date if date >= checkIn and date < checkOut
      return (
        (isSameDay(date, checkIn) || date > checkIn) &&
        date < checkOut
      );
    });

    const blocksOnDate = filteredBlocks.filter((b) => isSameDay(parseISO(b.date), date));

    return { bookings: bookingsOnDate, blocked: blocksOnDate };
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
      <div className="flex-1 min-w-[320px]">
        <h3 className="text-center font-display text-sm mb-3">
          {format(monthDate, "MMMM yyyy")}
        </h3>
        <div className="grid grid-cols-7 gap-px bg-line rounded-card overflow-hidden">
          {WEEKDAYS.map((day) => (
            <div key={day} className="bg-sand text-center text-[10px] text-ink/50 font-mono py-1.5">
              {day}
            </div>
          ))}
          {weeks.map((week, wi) =>
            week.map((date, di) => {
              const inMonth = isSameMonth(date, monthDate);
              const { bookings, blocked } = getEventsForDate(date);
              const isToday = isSameDay(date, new Date());

              return (
                <div
                  key={`${wi}-${di}`}
                  className={`bg-paper min-h-[60px] p-1 ${!inMonth ? "opacity-30" : ""} ${
                    isToday ? "ring-1 ring-inset ring-brick" : ""
                  }`}
                >
                  <span className={`text-[10px] font-mono ${isToday ? "text-brick font-bold" : "text-ink/50"}`}>
                    {format(date, "d")}
                  </span>
                  <div className="space-y-0.5 mt-0.5">
                    {bookings.slice(0, 3).map((b) => (
                      <div
                        key={b.id}
                        className="text-[9px] leading-tight px-1 py-0.5 rounded truncate text-paper"
                        style={{ backgroundColor: getColorForProperty(b.propertyId) }}
                        title={`${b.propertyName}: ${b.guestName} (${b.status})`}
                      >
                        {selectedProperty === "all" ? b.propertyName.slice(0, 8) : b.guestName.slice(0, 12)}
                      </div>
                    ))}
                    {bookings.length > 3 && (
                      <div className="text-[9px] text-ink/40 px-1">+{bookings.length - 3}</div>
                    )}
                    {blocked.map((bl) => (
                      <div
                        key={bl.id}
                        className="text-[9px] leading-tight px-1 py-0.5 rounded bg-line text-ink/40 truncate"
                        title={`${bl.propertyName}: Blocked (${bl.source})`}
                      >
                        ✕ {selectedProperty === "all" ? bl.propertyName.slice(0, 6) : bl.source}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="btn-secondary text-xs px-3 py-2"
          >
            ← Prev
          </button>
          <button
            onClick={() => setCurrentMonth(startOfMonth(new Date()))}
            className="text-xs text-brick hover:underline"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="btn-secondary text-xs px-3 py-2"
          >
            Next →
          </button>
        </div>

        <select
          value={selectedProperty}
          onChange={(e) => setSelectedProperty(e.target.value)}
          className="input w-48 text-xs"
        >
          <option value="all">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Calendar grid */}
      <div className="flex gap-4 flex-wrap">
        {renderMonth(currentMonth)}
        {renderMonth(addMonths(currentMonth, 1))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-3">
        {properties.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5 text-[11px] text-ink/60">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-ink/60">
          <span className="w-3 h-3 rounded-sm bg-line" />
          Blocked
        </span>
      </div>

      {/* Upcoming bookings list */}
      <div className="mt-8 rule pt-6">
        <h3 className="text-sm font-medium mb-3">Upcoming bookings</h3>
        <div className="space-y-2">
          {filteredEvents
            .filter((e) => parseISO(e.checkIn) >= new Date())
            .slice(0, 10)
            .map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs ledger-card p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getColorForProperty(e.propertyId) }}
                  />
                  <span className="font-medium">{e.propertyName}</span>
                  <span className="text-ink/50">— {e.guestName}</span>
                </div>
                <div className="text-ink/50 font-mono">
                  {format(parseISO(e.checkIn), "MMM d")} → {format(parseISO(e.checkOut), "MMM d")}
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                    e.status === "CONFIRMED" ? "bg-sage/20 text-sage" : "bg-brick/10 text-brick"
                  }`}>
                    {e.status}
                  </span>
                </div>
              </div>
            ))}
          {filteredEvents.filter((e) => parseISO(e.checkIn) >= new Date()).length === 0 && (
            <p className="text-xs text-ink/40">No upcoming bookings</p>
          )}
        </div>
      </div>
    </div>
  );
}
