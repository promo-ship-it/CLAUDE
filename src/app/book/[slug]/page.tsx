"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatCents } from "@/lib/format";
import type { Quote, QuoteSet } from "@/lib/quote";
import {
  DEPOSIT_PLACE_DAYS_BEFORE,
  DEPOSIT_RELEASE_DAYS,
  POLICY_NAMES,
  POLICY_SUMMARIES,
  depositAmountFor
} from "@/lib/policy";
import PriceBreakdown from "@/components/PriceBreakdown";

// useSearchParams requires a Suspense boundary in Next 14's App Router,
// or the production build fails — this wrapper provides it.
export default function BookPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-6 py-16">Loading…</div>}>
      <BookPageInner />
    </Suspense>
  );
}

function BookPageInner() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const checkIn = search.get("checkIn") || "";
  const checkOut = search.get("checkOut") || "";
  const guests = Number(search.get("guests") || 1);

  const [quotes, setQuotes] = useState<QuoteSet | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [plan, setPlan] = useState<"STANDARD" | "NON_REFUNDABLE">("STANDARD");
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [acceptedNonRefundable, setAcceptedNonRefundable] = useState(false);
  const [authorizeRecurring, setAuthorizeRecurring] = useState(false);
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
          setError(data.error || "Those dates are no longer available. Please choose new dates.");
        } else {
          setQuotes(data.quotes);
          setPaymentsEnabled(Boolean(data.paymentsEnabled));
        }
      })
      .catch(() => setError("Couldn't load pricing. Please refresh."));
  }, [checkIn, checkOut, params.slug, router]);

  const selected: Quote | null = quotes
    ? plan === "NON_REFUNDABLE" && quotes.nonRefundable
      ? quotes.nonRefundable
      : quotes.standard
    : null;
  const isLongStay = Boolean(quotes?.isLongStay);
  const isNonRefundable = selected?.plan === "NON_REFUNDABLE";
  const needsRecurringAuth = isLongStay && paymentsEnabled && (selected?.monthly?.totalPayments ?? 1) > 1;

  const canSubmit =
    !!selected &&
    !submitting &&
    agreedToTerms &&
    (!isNonRefundable || acceptedNonRefundable) &&
    (!needsRecurringAuth || authorizeRecurring);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
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
          plan: isNonRefundable ? "NON_REFUNDABLE" : "STANDARD",
          acceptedTerms: agreedToTerms,
          acceptedNonRefundable: isNonRefundable ? acceptedNonRefundable : undefined,
          authorizeRecurring: isLongStay ? authorizeRecurring || !needsRecurringAuth : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setSubmitting(false);
        return;
      }
      if (data.url) window.location.href = data.url;
      else router.push(data.redirect || `/book/${params.slug}/confirmation?bookingId=${data.bookingId}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const buttonLabel = () => {
    if (submitting) return "Please wait…";
    if (!selected) return "Loading…";
    if (!paymentsEnabled) return "Send request to book";
    if (selected.schedule) return `Pay ${formatCents(selected.schedule[0].amount)} today and book`;
    return `Pay ${formatCents(selected.total)} and book`;
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <p className="label-eyebrow mb-3">
        {!paymentsEnabled ? "Request to book" : isLongStay ? "Monthly payment plan" : "Confirm and pay"}
      </p>
      <h1 className="text-3xl mb-8">Just a few details</h1>

      {quotes && selected && (
        <>
          <p className="text-sm text-ink/60 font-mono mb-3">
            {checkIn} → {checkOut} · {selected.nights} nights · {guests} guest{guests > 1 ? "s" : ""}
          </p>

          {/* Rate choice (stays under 30 nights, online payment only) */}
          {!isLongStay && quotes.nonRefundable && (
            <fieldset className="grid sm:grid-cols-2 gap-3 mb-6">
              <legend className="text-sm mb-2">Choose your rate</legend>
              {[
                { key: "STANDARD" as const, q: quotes.standard, title: "Standard rate", sub: "Free cancellation until 5 days before check-in" },
                {
                  key: "NON_REFUNDABLE" as const,
                  q: quotes.nonRefundable,
                  title: `Non-refundable — save ${formatCents(quotes.standard.total - quotes.nonRefundable.total)}`,
                  sub: "No refund after 24 hours"
                }
              ].map((o) => (
                <label
                  key={o.key}
                  className={`ledger-card p-4 cursor-pointer ${plan === o.key ? "border-ink ring-1 ring-ink" : ""}`}
                >
                  <input
                    type="radio"
                    name="plan"
                    className="sr-only"
                    checked={plan === o.key}
                    onChange={() => setPlan(o.key)}
                  />
                  <span className="block text-sm font-medium">{o.title}</span>
                  <span className="block font-mono text-lg mt-1">{formatCents(o.q.total)}</span>
                  <span className="block text-xs text-ink/50 mt-1">{o.sub}</span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="ledger-card p-5 mb-4">
            <PriceBreakdown quote={selected} />
          </div>

          <div className="text-xs text-ink/60 mb-8 leading-relaxed">
            <span className="font-medium text-ink">Cancellation policy — {POLICY_NAMES[selected.plan]}:</span>{" "}
            {POLICY_SUMMARIES[selected.plan]}
          </div>

          {paymentsEnabled && depositAmountFor(selected.nights) > 0 && (
            <div className="text-xs text-ink/60 -mt-6 mb-8 leading-relaxed">
              <span className="font-medium text-ink">Security hold:</span> a refundable {formatCents(depositAmountFor(selected.nights))} hold
              (not a charge) is placed on your card {DEPOSIT_PLACE_DAYS_BEFORE} day{DEPOSIT_PLACE_DAYS_BEFORE === 1 ? "" : "s"} before check-in and released{" "}
              {DEPOSIT_RELEASE_DAYS} days after check-out unless damage is reported. Prepaid cards aren&apos;t accepted.
            </div>
          )}
        </>
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
          <label className="block text-sm mb-1">Phone</label>
          <input
            required
            type="tel"
            minLength={7}
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

        {/* Monthly billing authorization (long stays) */}
        {needsRecurringAuth && selected?.schedule && (
          <div className="bg-sand border border-line rounded-card p-4">
            <p className="text-sm font-medium mb-2">Recurring payment authorization</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={authorizeRecurring}
                onChange={(e) => setAuthorizeRecurring(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-line"
              />
              <span className="text-sm text-ink/80">
                I authorize {formatCents(selected.schedule[0].amount)} to be charged today and{" "}
                {selected.schedule.length - 1} further automatic payment{selected.schedule.length - 1 === 1 ? "" : "s"} to the
                same card on the dates shown in the payment schedule above ({formatCents(selected.total)} total). Billing stops
                automatically after the last payment.
              </span>
            </label>
          </div>
        )}

        {/* Non-refundable acknowledgement */}
        {isNonRefundable && (
          <div className="bg-sand border border-line rounded-card p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedNonRefundable}
                onChange={(e) => setAcceptedNonRefundable(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-line"
              />
              <span className="text-sm text-ink/80">
                I understand this rate is <strong>non-refundable</strong>. I can cancel for a full refund only within 24 hours
                of booking (and only if check-in is at least 7 days away). After that, the full{" "}
                {selected ? formatCents(selected.total) : ""} — including the cleaning fee and taxes — is not refunded.
              </span>
            </label>
          </div>
        )}

        {/* Terms & Conditions agreement */}
        <div className="border border-line rounded-card p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-line"
            />
            <span className="text-sm text-ink/70">
              I have read and agree to the{" "}
              <a href="/terms" target="_blank" className="text-brick hover:underline">
                Terms &amp; Conditions
              </a>
              , including the cancellation policy, house rules, and damage liability terms.
            </span>
          </label>
        </div>

        <button type="submit" disabled={!canSubmit} className="btn-primary w-full mt-2">
          {buttonLabel()}
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
