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

const RECURRING_THRESHOLD = 30;
const LONG_STAY_DISCOUNT = 18; // percent

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
  const [authorizeRecurring, setAuthorizeRecurring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRecurring = breakdown && breakdown.nights >= RECURRING_THRESHOLD;

  // Calculate recurring payment details client-side for display
  const recurringDetails = isRecurring && breakdown ? (() => {
    const discountMultiplier = 1 - (LONG_STAY_DISCOUNT / 100);
    const discountedSubtotal = Math.round(breakdown.subtotal * discountMultiplier);
    const savings = breakdown.subtotal - discountedSubtotal;
    const avgNightlyRate = discountedSubtotal / breakdown.nights;
    const monthlyRate = Math.round(avgNightlyRate * 30);
    const fullMonths = Math.floor(breakdown.nights / 30);
    const proratedNights = breakdown.nights % 30;
    const totalPayments = proratedNights > 0 ? fullMonths + 1 : fullMonths;
    const proratedAmount = proratedNights > 0 ? Math.round(avgNightlyRate * proratedNights) : 0;
    const discountedTotal = discountedSubtotal + breakdown.cleaningFee + Math.round(breakdown.taxTotal * discountMultiplier);
    return { monthlyRate, fullMonths, proratedNights, totalPayments, proratedAmount, savings, discountedTotal };
  })() : null;

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
        body: JSON.stringify({
          slug: params.slug,
          checkIn,
          checkOut,
          guests,
          ...form,
          ...(isRecurring && paymentsEnabled ? { authorizeRecurring } : {})
        })
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
        {paymentsEnabled
          ? isRecurring
            ? "Monthly payment plan"
            : "Confirm and pay"
          : "Request to book"}
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

          {isRecurring && recurringDetails && paymentsEnabled ? (
            <>
              <div className="mt-3 pt-3 rule space-y-2">
                <div className="flex justify-between text-sage font-semibold">
                  <span>Long stay discount ({LONG_STAY_DISCOUNT}% off)</span>
                  <span>−{formatCents(recurringDetails.savings)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/60">Monthly payment</span>
                  <span>{formatCents(recurringDetails.monthlyRate)}/month</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/60">Full months</span>
                  <span>{recurringDetails.fullMonths} × {formatCents(recurringDetails.monthlyRate)}</span>
                </div>
                {recurringDetails.proratedNights > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink/60">Final month ({recurringDetails.proratedNights} nights, prorated)</span>
                    <span>{formatCents(recurringDetails.proratedAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-ink/60">Cleaning fee (first payment)</span>
                  <span>{formatCents(breakdown.cleaningFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/60">Taxes (total)</span>
                  <span>{formatCents(breakdown.taxTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/60">Total payments</span>
                  <span>{recurringDetails.totalPayments} payments</span>
                </div>
              </div>
              <div className="flex justify-between pt-3 rule mt-3">
                <span className="text-ink/40 line-through">Without discount</span>
                <span className="text-ink/40 line-through">{formatCents(breakdown.total)}</span>
              </div>
              <div className="flex justify-between pt-1 font-semibold">
                <span>Grand total</span>
                <span>{formatCents(recurringDetails.discountedTotal)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between pt-3 rule mt-3 font-semibold">
              <span>Total</span>
              <span>{formatCents(breakdown.total)}</span>
            </div>
          )}
        </div>
      )}

      {/* Recurring payment authorization notice */}
      {isRecurring && paymentsEnabled && recurringDetails && (
        <div className="bg-sand border border-line rounded-card p-4 mb-8">
          <p className="text-sm font-medium text-ink mb-2">Recurring payment authorization</p>
          <p className="text-xs text-ink/70 leading-relaxed mb-4">
            By checking the box below, you authorize automatic monthly charges of{" "}
            <strong>{formatCents(recurringDetails.monthlyRate)}</strong> to your payment method
            for <strong>{recurringDetails.totalPayments} months</strong> beginning today.
            {recurringDetails.proratedNights > 0 && (
              <> The final payment will be prorated to{" "}
              <strong>{formatCents(recurringDetails.proratedAmount)}</strong> for the remaining{" "}
              {recurringDetails.proratedNights} nights.</>
            )}{" "}
            The first payment includes a one-time cleaning fee of{" "}
            <strong>{formatCents(breakdown!.cleaningFee)}</strong>.
            Your total obligation is <strong>{formatCents(breakdown!.total)}</strong>.
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={authorizeRecurring}
              onChange={(e) => setAuthorizeRecurring(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-line"
            />
            <span className="text-sm text-ink">
              I authorize recurring monthly payments of {formatCents(recurringDetails.monthlyRate)} for
              the duration of my stay ({recurringDetails.totalPayments} payments, {formatCents(breakdown!.total)} total).
            </span>
          </label>
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

        <button
          type="submit"
          disabled={submitting || !breakdown || (!!isRecurring && paymentsEnabled && !authorizeRecurring)}
          className="btn-primary w-full mt-4"
        >
          {submitting
            ? "Please wait…"
            : paymentsEnabled
              ? isRecurring
                ? `Authorize ${recurringDetails ? formatCents(recurringDetails.monthlyRate) : ""}/month and book`
                : `Pay ${breakdown ? formatCents(breakdown.total) : ""} and book`
              : "Send request to book"}
        </button>

        {isRecurring && paymentsEnabled && !authorizeRecurring && (
          <p className="text-xs text-brick text-center pt-2">
            You must check the authorization box above to proceed with monthly payments.
          </p>
        )}

        {!paymentsEnabled && (
          <p className="text-xs text-ink/50 text-center pt-2">
            No payment is collected now — we'll confirm your dates by email.
          </p>
        )}
      </form>
    </div>
  );
}
