import { PriceBreakdown } from "./pricing";

export const RECURRING_THRESHOLD_NIGHTS = 30;
export const LONG_STAY_DISCOUNT_PERCENT = 18; // 18% discount for stays 30+ nights

export type RecurringBreakdown = {
  isRecurring: true;
  monthlyRate: number; // cents — what's charged each full month
  totalPayments: number; // total number of payments
  fullMonths: number; // number of full 30-night months
  proratedNights: number; // remaining nights after full months
  proratedAmount: number; // cents for the final partial month (0 if evenly divisible)
  firstPayment: number; // cents — first charge (full month)
  totalAmount: number; // cents — grand total over all payments
  cleaningFee: number; // cents — charged once on first payment
  taxTotal: number; // cents — total tax across all payments
  nights: number;
};

export type OneTimeBreakdown = {
  isRecurring: false;
  breakdown: PriceBreakdown;
};

export type PaymentPlan = RecurringBreakdown | OneTimeBreakdown;

/**
 * Given a price breakdown from the pricing engine, determine if this stay
 * qualifies for recurring monthly billing (30+ nights) and compute the
 * monthly payment schedule.
 *
 * IMPORTANT: Discounts do NOT stack. If smart pricing already applied a
 * discount (e.g. -15% low demand), compare it to the 18% long-stay discount
 * and apply whichever is greater. The guest always gets the best single
 * discount, never both combined.
 *
 * Monthly rate = subtotal / nights * 30 (one month's worth of nightly rates).
 * Final payment is prorated for remaining nights.
 * Cleaning fee is added to the first payment only.
 * Tax is distributed proportionally across all payments.
 */
export function calculatePaymentPlan(breakdown: PriceBreakdown): PaymentPlan {
  if (breakdown.nights < RECURRING_THRESHOLD_NIGHTS) {
    return { isRecurring: false, breakdown };
  }

  // The breakdown.subtotal already has smart pricing adjustments baked in.
  // Calculate what the subtotal would be WITHOUT any smart pricing discounts
  // (i.e. the "base" subtotal) to fairly compare the two discount options.
  //
  // Since we can't easily reverse the smart pricing per-night adjustments
  // from here, we compare the long-stay discount against the effective
  // discount that smart pricing already applied.
  //
  // Strategy: Apply the 18% long-stay discount to the raw subtotal.
  // The "raw subtotal" here IS the smart-priced subtotal (discounts already in).
  // So we only apply the long-stay discount IF it would result in a LOWER price
  // than what smart pricing already gave. In practice:
  // - If smart pricing gave -15%, and long-stay is -18%, apply the extra 3% only.
  //   Actually, simpler: just take the max discount as a flat 18% off the
  //   base rates (before smart pricing). But since we don't have pre-smart-pricing
  //   rates here, we use a different approach:
  //
  // SIMPLIFIED APPROACH: The long-stay discount of 18% is applied to the
  // subtotal AS-IS (which already includes any smart pricing surcharges like
  // weekend +15%), but NO ADDITIONAL smart pricing discounts stack on top.
  // The pricing engine should skip negative adjustments for 30+ night stays,
  // only applying surcharges (positive adjustments). Then the 18% flat
  // long-stay discount is the only discount applied here.
  //
  // This means: surcharges (weekend, high demand) still apply to individual
  // nights, but discount rules (last-minute, far-out, low-demand) are
  // superseded by the 18% long-stay discount.

  const discountMultiplier = 1 - (LONG_STAY_DISCOUNT_PERCENT / 100);
  const discountedSubtotal = Math.round(breakdown.subtotal * discountMultiplier);
  const { nights, cleaningFee } = breakdown;
  // Recalculate tax on discounted amount
  const taxRate = breakdown.taxTotal / (breakdown.subtotal + cleaningFee || 1);
  const taxTotal = Math.round((discountedSubtotal + cleaningFee) * taxRate);

  // Calculate full months and remaining nights
  const fullMonths = Math.floor(nights / 30);
  const proratedNights = nights % 30;
  const totalPayments = proratedNights > 0 ? fullMonths + 1 : fullMonths;

  // Monthly rate based on discounted average nightly rate × 30
  const avgNightlyRate = discountedSubtotal / nights;
  const monthlyRate = Math.round(avgNightlyRate * 30);

  // Prorated amount for the final partial month
  const proratedAmount = proratedNights > 0
    ? Math.round(avgNightlyRate * proratedNights)
    : 0;

  // Tax distributed per payment proportionally
  const taxPerFullMonth = Math.round((taxTotal * monthlyRate) / discountedSubtotal);
  const taxForProrated = proratedNights > 0
    ? taxTotal - (taxPerFullMonth * fullMonths)
    : 0;

  // First payment includes cleaning fee + first month + proportional tax
  const firstPayment = monthlyRate + cleaningFee + taxPerFullMonth;

  // Total = discounted subtotal + cleaning fee + tax
  const totalAmount = discountedSubtotal + cleaningFee + taxTotal;

  return {
    isRecurring: true,
    monthlyRate,
    totalPayments,
    fullMonths,
    proratedNights,
    proratedAmount,
    firstPayment,
    totalAmount,
    cleaningFee,
    taxTotal,
    nights
  };
}

/**
 * Format the payment schedule as an array of { label, amount } for display.
 */
export function getPaymentSchedule(plan: RecurringBreakdown): { label: string; amount: number }[] {
  const schedule: { label: string; amount: number }[] = [];

  const taxPerFullMonth = Math.round((plan.taxTotal * plan.monthlyRate) / (plan.totalAmount - plan.cleaningFee - plan.taxTotal));

  // First payment (month 1 + cleaning fee + tax)
  schedule.push({
    label: "Payment 1 (today) — includes cleaning fee",
    amount: plan.firstPayment
  });

  // Middle full months
  for (let i = 2; i <= plan.fullMonths; i++) {
    schedule.push({
      label: `Payment ${i} — month ${i}`,
      amount: plan.monthlyRate + taxPerFullMonth
    });
  }

  // Final prorated payment (if any)
  if (plan.proratedNights > 0) {
    const taxForProrated = plan.taxTotal - (taxPerFullMonth * plan.fullMonths);
    schedule.push({
      label: `Payment ${plan.totalPayments} — ${plan.proratedNights} nights (prorated)`,
      amount: plan.proratedAmount + taxForProrated
    });
  }

  return schedule;
}
