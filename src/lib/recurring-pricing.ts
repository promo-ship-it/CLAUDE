import { PriceBreakdown } from "./pricing";

export const RECURRING_THRESHOLD_NIGHTS = 30;

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
 * Monthly rate = subtotal / nights * 30 (one month's worth of nightly rates).
 * Final payment is prorated for remaining nights.
 * Cleaning fee is added to the first payment only.
 * Tax is distributed proportionally across all payments.
 */
export function calculatePaymentPlan(breakdown: PriceBreakdown): PaymentPlan {
  if (breakdown.nights < RECURRING_THRESHOLD_NIGHTS) {
    return { isRecurring: false, breakdown };
  }

  const { nights, subtotal, cleaningFee, taxTotal } = breakdown;

  // Calculate full months and remaining nights
  const fullMonths = Math.floor(nights / 30);
  const proratedNights = nights % 30;
  const totalPayments = proratedNights > 0 ? fullMonths + 1 : fullMonths;

  // Monthly rate based on average nightly rate × 30
  const avgNightlyRate = subtotal / nights;
  const monthlyRate = Math.round(avgNightlyRate * 30);

  // Prorated amount for the final partial month
  const proratedAmount = proratedNights > 0
    ? Math.round(avgNightlyRate * proratedNights)
    : 0;

  // Tax distributed per payment proportionally
  const taxPerFullMonth = Math.round((taxTotal * monthlyRate) / subtotal);
  const taxForProrated = proratedNights > 0
    ? taxTotal - (taxPerFullMonth * fullMonths)
    : 0;

  // First payment includes cleaning fee + first month + proportional tax
  const firstPayment = monthlyRate + cleaningFee + taxPerFullMonth;

  // Total = subtotal + cleaning fee + tax (same as one-time, just split differently)
  const totalAmount = subtotal + cleaningFee + taxTotal;

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
