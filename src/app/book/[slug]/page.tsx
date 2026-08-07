"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCents } from "@/lib/format";

type Breakdown = {
  nights: number;
  subtotal: number;
  cleaningFee: number;
  taxTotal: number;
  total: number;
};

// useSearchParams requires a Suspense boundary in Next 14's App Router,
// or the production build fails — this wrapper provides it.
export default function BookPage({ params }: { params: { slug: string } }) {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-6 py-16">Loading…</div>}>
      <BookPageInner params={params} />
    </Suspense>
  );
}

function BookPageInner({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const search = useSearchParams();
  const checkIn = search.get("checkIn") || "";
  const checkOut = search.get("checkOut") || "";
  const guests = Number(search.get("guests") || 1);

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checkIn || !checkOut) {
      router.push(`/properties/${params.slug}`);
      return;
    }
    fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: params.slug, checkIn, checkOut })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.available === false || data.error) {
          setError("Those dates are no longer available. Please choose new dates.");
        } else {
          setBreakdown(data.breakdown);
        }
      });
    // Payments-enabled flag comes from env at build; a lightweight check here
    // just tries the config endpoint indirectly via checkout attempt state.
  }, [checkIn, checkOut, params.slug, router]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setPaymentsEnabled(d.paymentsEnabled))
      .catch(() => setPaymentsEnabled(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const endpoint = paymentsEnabled ? "/api/checkout" : "/api/bookings";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: params.slug, checkIn, checkOut, guests, ...form })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setSubmitting(false);
        return;
      }
      if (paymentsEnabled && data.url) {
        window.location.href = data.url;
      } else {
        router.push(`/book/${params.slug}/confirmation?bookingId=${data.bookingId}`);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <p className="label-eyebrow mb-3">
        {paymentsEnabled ? "Confirm and pay" : "Request to book"}
      </p>
      <h1 className="text-3xl mb-8">Just a few details</h1>

      {breakdown && (
        <div className="ledger-card p-5 mb-8 font-mono text-sm">
          <div className="flex justify-between mb-1">
            <span className="text-ink/60">
              {checkIn} → {checkOut} · {breakdown.nights} nights · {guests} guest
              {guests > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex justify-between pt-3 rule mt-3 font-semibold">
            <span>Total</span>
            <span>{formatCents(breakdown.total)}</span>
          </div>
        </div>
      )}

      {error && <p className="text-brick text-sm mb-6">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Full name</label>
          <input
            required
            className="w-full border border-line rounded-card p-3"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            required
            type="email"
            className="w-full border border-line rounded-card p-3"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Phone (optional)</label>
          <input
            className="w-full border border-line rounded-card p-3"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Anything we should know? (optional)</label>
          <textarea
            className="w-full border border-line rounded-card p-3"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <button type="submit" disabled={submitting || !breakdown} className="btn-primary w-full mt-4">
          {submitting
            ? "Please wait…"
            : paymentsEnabled
              ? `Pay ${breakdown ? formatCents(breakdown.total) : ""} and book`
              : "Send request to book"}
        </button>

        {!paymentsEnabled && (
          <p className="text-xs text-ink/50 text-center pt-2">
            No payment is collected now — we'll confirm your dates by email.
          </p>
        )}
      </form>
    </div>
  );
}
