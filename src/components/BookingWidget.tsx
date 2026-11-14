"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";
import type { QuoteSet } from "@/lib/quote";
import PriceBreakdown from "./PriceBreakdown";

export default function BookingWidget({
  propertySlug,
  minNights,
  maxGuests
}: {
  propertySlug: string;
  minNights: number;
  maxGuests: number;
}) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [quotes, setQuotes] = useState<QuoteSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setQuotes(null);
    setError(null);
    if (!checkIn || !checkOut || checkOut <= checkIn) return;

    const timeout = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: propertySlug, checkIn, checkOut })
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || "Something went wrong");
        else if (data.available === false) setError("Some of those dates are already booked. Try a different range.");
        else setQuotes(data.quotes);
      } catch {
        setError("Couldn't check availability. Try again.");
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [checkIn, checkOut, propertySlug]);

  const today = new Date().toISOString().slice(0, 10);

  const handleContinue = () => {
    const params = new URLSearchParams({ checkIn, checkOut, guests: String(guests) });
    router.push(`/book/${propertySlug}?${params.toString()}`);
  };

  return (
    <div className="ledger-card p-5">
      <div className="grid grid-cols-2 gap-px bg-line border border-line rounded-card overflow-hidden mb-3">
        <label className="bg-paper p-3">
          <span className="block text-[11px] uppercase tracking-wide text-ink/50 mb-1">Check-in</span>
          <input
            type="date"
            min={today}
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="w-full text-sm bg-transparent outline-none"
          />
        </label>
        <label className="bg-paper p-3">
          <span className="block text-[11px] uppercase tracking-wide text-ink/50 mb-1">Check-out</span>
          <input
            type="date"
            min={checkIn || today}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="w-full text-sm bg-transparent outline-none"
          />
        </label>
      </div>

      <label className="block mb-4">
        <span className="block text-[11px] uppercase tracking-wide text-ink/50 mb-1">Guests</span>
        <select
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
          className="w-full text-sm border border-line rounded-card p-3 bg-paper"
        >
          {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} guest{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-ink/40 mb-4">Minimum stay: {minNights} nights</p>

      {checking && <p className="text-sm text-ink/50 mb-3">Checking availability…</p>}
      {error && <p className="text-sm text-brick mb-3">{error}</p>}

      {quotes && !error && (
        <div className="mb-4">
          <PriceBreakdown quote={quotes.standard} compact />
          {quotes.nonRefundable && (
            <p className="text-xs text-sage mt-3">
              Or pay {formatCents(quotes.nonRefundable.total)} with the non-refundable rate (save{" "}
              {formatCents(quotes.standard.total - quotes.nonRefundable.total)}).
            </p>
          )}
        </div>
      )}

      <button onClick={handleContinue} disabled={!quotes || Boolean(error)} className="btn-primary w-full">
        {quotes ? "Continue to book" : "Select dates"}
      </button>
    </div>
  );
}
