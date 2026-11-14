// Refund calculator for all three cancellation policies. Pure and client-safe:
// no database or Stripe calls, so the UI can preview the exact refund the
// server will issue. See POLICY_SUMMARIES in policy.ts for the plain-English rules.
import { differenceInCalendarDays, differenceInMinutes, startOfDay } from "date-fns";
import {
  GRACE_MIN_DAYS_BEFORE_CHECKIN,
  LONG_TERM_FULL_REFUND_DAYS,
  LONG_TERM_NOTICE_NIGHTS,
  MODERATE_FULL_REFUND_DAYS,
  MODERATE_GRACE_HOURS,
  NON_REFUNDABLE_GRACE_HOURS,
  type RatePlan
} from "./policy";

export type CancellationInput = {
  policy: RatePlan;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  bookedAt: Date;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  subtotal: number; // nightly subtotal after discount (cents)
  cleaningFee: number;
  taxRate: number;
  total: number; // full price of the stay (cents)
  amountPaid: number; // cents actually collected so far (0 for unpaid / request-to-book)
  hostInitiated: boolean; // host cancels => always a full refund
  now?: Date;
};

export type CancellationResult = {
  allowed: boolean;
  reason?: string; // why not allowed
  refund: number; // cents to refund now
  kept: number; // cents the host keeps (of what was paid)
  shortfall: number; // long stays: cents still owed beyond what was paid
  fullRefund: boolean;
  explanation: string;
};

const notAllowed = (reason: string): CancellationResult => ({
  allowed: false, reason, refund: 0, kept: 0, shortfall: 0, fullRefund: false, explanation: reason
});

export function computeCancellation(input: CancellationInput): CancellationResult {
  const now = input.now ?? new Date();
  const today = startOfDay(now);
  const checkInDay = startOfDay(input.checkIn);
  const daysBefore = differenceInCalendarDays(checkInDay, today);
  const hoursSinceBooking = differenceInMinutes(now, input.bookedAt) / 60;
  const paid = Math.max(0, input.amountPaid);

  if (input.status === "CANCELLED") return notAllowed("This booking is already cancelled.");
  if (input.status === "COMPLETED") return notAllowed("This stay is already completed.");
  if (differenceInCalendarDays(startOfDay(input.checkOut), today) <= 0)
    return notAllowed("This stay has already ended.");

  const full = (explanation: string): CancellationResult => ({
    allowed: true, refund: paid, kept: 0, shortfall: 0, fullRefund: true, explanation
  });

  if (input.hostInitiated) return full("Cancelled by the host — full refund.");
  if (paid === 0 && input.status === "PENDING") return full("No payment was collected, so nothing is owed.");

  const inGrace = (hours: number) =>
    hoursSinceBooking <= hours && daysBefore >= GRACE_MIN_DAYS_BEFORE_CHECKIN;

  // Nights already stayed (0 until the check-in date has passed).
  const nightsStayed = Math.min(input.nights, Math.max(0, differenceInCalendarDays(today, checkInDay)));

  switch (input.policy) {
    case "NON_REFUNDABLE": {
      if (inGrace(NON_REFUNDABLE_GRACE_HOURS))
        return full(`Cancelled within ${NON_REFUNDABLE_GRACE_HOURS} hours of booking — full refund.`);
      return {
        allowed: true, refund: 0, kept: paid, shortfall: 0, fullRefund: false,
        explanation: "Non-refundable rate — no refund after the 24-hour grace period."
      };
    }

    case "MODERATE": {
      if (inGrace(MODERATE_GRACE_HOURS))
        return full(`Cancelled within ${MODERATE_GRACE_HOURS} hours of booking — full refund.`);
      if (daysBefore >= MODERATE_FULL_REFUND_DAYS)
        return full(`Cancelled ${MODERATE_FULL_REFUND_DAYS}+ days before check-in — full refund.`);
      // Host keeps nights stayed + 1 night + 50% of the remaining nights.
      // Cleaning fee and taxes follow the same proportion.
      const remainingAfterExtra = Math.max(0, input.nights - nightsStayed - 1);
      const keptNights = Math.min(input.nights, nightsStayed + 1 + remainingAfterExtra * 0.5);
      const kept = Math.min(paid, Math.round(input.total * (keptNights / input.nights)));
      return {
        allowed: true, refund: paid - kept, kept, shortfall: 0, fullRefund: false,
        explanation:
          nightsStayed > 0
            ? `${nightsStayed} night(s) stayed + 1 night are kept, and 50% of the remaining nights are refunded.`
            : `Cancelled less than ${MODERATE_FULL_REFUND_DAYS} days before check-in — 1 night plus 50% of the remaining nights are kept.`
      };
    }

    case "LONG_TERM_FIRM": {
      if (daysBefore >= LONG_TERM_FULL_REFUND_DAYS)
        return full(`Cancelled ${LONG_TERM_FULL_REFUND_DAYS}+ days before check-in — full refund.`);
      const nightsOwed = Math.min(input.nights, nightsStayed + LONG_TERM_NOTICE_NIGHTS);
      const rentOwed = Math.round((input.subtotal / input.nights) * nightsOwed);
      const owed =
        rentOwed + Math.round(rentOwed * input.taxRate) +
        input.cleaningFee + Math.round(input.cleaningFee * input.taxRate);
      const owedCapped = Math.min(owed, input.total);
      return {
        allowed: true,
        refund: Math.max(0, paid - owedCapped),
        kept: Math.min(paid, owedCapped),
        shortfall: Math.max(0, owedCapped - paid),
        fullRefund: false,
        explanation:
          `Nights stayed (${nightsStayed}) plus ${LONG_TERM_NOTICE_NIGHTS} nights' notice are owed ` +
          `(${nightsOwed} of ${input.nights} nights). Remaining monthly payments stop.`
      };
    }
  }
}
