"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, isBefore, startOfDay } from "date-fns";
import Calendar, { type CalendarDay } from "./Calendar";

export default function PropertyCalendar({
  propertySlug,
  minNights,
  maxGuests
}: {
  propertySlug: string;
  minNights: number;
  maxGuests: number;
}) {
  const router = useRouter();
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/availability?slug=${propertySlug}`)
      .then((r) => r.json())
      .then((data) => {
        setUnavailableDates(new Set(data.unavailableDates || []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [propertySlug]);

  const handleDateClick = (date: Date) => {
    if (!checkIn || (checkIn && checkOut)) {
      // Start new selection
      setCheckIn(date);
      setCheckOut(null);
    } else {
      // Set checkout
      if (isBefore(date, checkIn)) {
        // Clicked before check-in, reset
        setCheckIn(date);
        setCheckOut(null);
      } else {
        setCheckOut(date);
      }
    }
  };

  const handleBook = () => {
    if (!checkIn || !checkOut) return;
    const params = new URLSearchParams({
      checkIn: checkIn.toISOString().slice(0, 10),
      checkOut: checkOut.toISOString().slice(0, 10),
      guests: "1"
    });
    router.push(`/book/${propertySlug}?${params.toString()}`);
  };

  // Build calendar days from unavailable dates
  const calendarDays: CalendarDay[] = Array.from(unavailableDates).map((iso) => ({
    date: new Date(iso + "T00:00:00"),
    status: "booked" as const
  }));

  if (loading) {
    return <div className="text-sm text-ink/50 py-8">Loading calendar…</div>;
  }

  return (
    <div>
      <p className="text-sm text-ink/60 mb-4">
        {!checkIn
          ? "Select your check-in date"
          : !checkOut
            ? "Now select your check-out date"
            : "Dates selected — book below"}
      </p>

      <Calendar
        days={calendarDays}
        onDateClick={handleDateClick}
        selectedRange={{ start: checkIn, end: checkOut }}
        minDate={new Date()}
        monthsToShow={2}
      />

      {checkIn && checkOut && (
        <div className="mt-6 p-4 ledger-card">
          <p className="text-sm font-mono mb-3">
            {checkIn.toLocaleDateString("en-US", { month: "short", day: "numeric" })} →{" "}
            {checkOut.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          <button onClick={handleBook} className="btn-primary w-full">
            Continue to book
          </button>
        </div>
      )}

      <p className="text-xs text-ink/40 mt-3">Minimum stay: {minNights} nights</p>
    </div>
  );
}
