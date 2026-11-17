// Booking & cancellation policy — the single source of truth.
// Client-safe (no Prisma/Stripe imports): used by the pricing engine, the
// cancellation calculator, the booking UI, and the Terms page.
//
// All "days before check-in" rules are CALENDAR days between today and the
// check-in date (server time, UTC on Vercel).

/** Bump this whenever /terms changes. Stored on every booking at acceptance. */
export const TERMS_VERSION = "2026-11-14.2";

export const CHECK_IN_TIME = "3:00 PM";
export const CHECK_OUT_TIME = "11:00 AM";

// ── Long stays (monthly billing) ───────────────────────────────────────────
export const LONG_STAY_NIGHTS = 30; // stays of this many nights or more
export const LONG_STAY_DISCOUNT_PERCENT = 18;
export const LONG_TERM_FULL_REFUND_DAYS = 30; // full refund if cancelled 30+ days before check-in
export const LONG_TERM_NOTICE_NIGHTS = 30; // otherwise guest pays nights stayed + 30 nights

// ── Moderate (default for stays under 30 nights) ───────────────────────────
export const MODERATE_FULL_REFUND_DAYS = 5; // full refund if cancelled 5+ days before check-in
export const MODERATE_GRACE_HOURS = 48; // full refund within 48h of booking...
export const GRACE_MIN_DAYS_BEFORE_CHECKIN = 7; // ...if check-in is 7+ days away

// ── Non-refundable option (stays under 30 nights) ──────────────────────────
export const NON_REFUNDABLE_DISCOUNT_PERCENT = 10; // off the nightly rate (not the cleaning fee)
export const NON_REFUNDABLE_GRACE_HOURS = 24; // full refund within 24h of booking if check-in 7+ days away
export const NON_REFUNDABLE_MIN_DAYS_BEFORE_CHECKIN = 5; // not offered inside 5 days of check-in
export const NON_REFUNDABLE_MAX_DAYS_TO_CHECKOUT = 60; // not offered if checkout is 60+ days after booking

// ── Damages (Terms §5) ─────────────────────────────────────────────────────
export const DAMAGE_MAX_CENTS = 250000; // total damage charges per booking ($2,500)
export const DAMAGE_NOTICE_HOURS = 48; // guest is notified at least this long before the card is charged
export const SMOKING_FEE_CENTS = 50000; // $500
export const PET_FEE_CENTS = 25000; // $250

// ── Security deposit hold (Terms §5) ───────────────────────────────────────
// A refundable authorization (not a charge) placed on the guest's card.
// Amount by length of stay: the tier with the largest `minNights` that the
// stay meets applies. Add rows to vary it, e.g. { minNights: 7, cents: 50000 }.
export const DEPOSIT_TIERS: { minNights: number; cents: number }[] = [{ minNights: 1, cents: 35000 }];
export const DEPOSIT_PLACE_DAYS_BEFORE = 1; // placed this many days before check-in
export const DEPOSIT_RELEASE_DAYS = 3; // released this many days after check-out if no damage is reported
export const DEPOSIT_RENEW_HOURS = 48; // renewed when it would expire within this many hours
export const BLOCK_PREPAID_CARDS = true; // prepaid cards rejected at checkout / when saving a card

/** Security hold amount for a stay length (0 = no hold). */
export function depositAmountFor(nights: number): number {
  const tier = [...DEPOSIT_TIERS].sort((a, b) => b.minNights - a.minNights).find((t) => nights >= t.minNights);
  return tier?.cents ?? 0;
}

/** Unpaid Stripe checkouts hold the dates this long, then release them. */
export const PENDING_PAYMENT_HOLD_MINUTES = 35;

export type RatePlan = "MODERATE" | "NON_REFUNDABLE" | "LONG_TERM_FIRM";

export const POLICY_NAMES: Record<RatePlan, string> = {
  MODERATE: "Moderate",
  NON_REFUNDABLE: "Non-refundable",
  LONG_TERM_FIRM: "Long-stay (Firm)"
};

/** One-paragraph, guest-facing summary of each policy. */
export const POLICY_SUMMARIES: Record<RatePlan, string> = {
  MODERATE:
    `Free cancellation until ${MODERATE_FULL_REFUND_DAYS} days before check-in, plus a full refund ` +
    `within ${MODERATE_GRACE_HOURS} hours of booking if check-in is at least ${GRACE_MIN_DAYS_BEFORE_CHECKIN} days away. ` +
    `After that, cancelling keeps 1 night plus 50% of the remaining nights (cleaning fee and taxes are refunded in the same proportion). ` +
    `After check-in, nights stayed plus 1 night are kept, and 50% of the remaining nights are refunded.`,
  NON_REFUNDABLE:
    `${NON_REFUNDABLE_DISCOUNT_PERCENT}% off the nightly rate in exchange for no refund. ` +
    `Full refund only if you cancel within ${NON_REFUNDABLE_GRACE_HOURS} hours of booking and check-in is at least ` +
    `${GRACE_MIN_DAYS_BEFORE_CHECKIN} days away. After that, nothing is refunded — including the cleaning fee and taxes.`,
  LONG_TERM_FIRM:
    `Free cancellation until ${LONG_TERM_FULL_REFUND_DAYS} days before check-in. After that, you pay for nights stayed ` +
    `plus ${LONG_TERM_NOTICE_NIGHTS} more nights (or the rest of the stay, if fewer remain); any amount already paid ` +
    `beyond that is refunded, and remaining monthly payments stop.`
};
