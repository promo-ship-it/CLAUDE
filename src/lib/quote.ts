import type { Prisma, PrismaClient } from "@prisma/client";
import { addDays, addMonths, differenceInCalendarDays, startOfDay } from "date-fns";
import { prisma } from "./prisma";
import { calculatePrice } from "./pricing";
import {
  LONG_STAY_DISCOUNT_PERCENT,
  LONG_STAY_NIGHTS,
  NON_REFUNDABLE_DISCOUNT_PERCENT,
  NON_REFUNDABLE_MAX_DAYS_TO_CHECKOUT,
  NON_REFUNDABLE_MIN_DAYS_BEFORE_CHECKIN,
  type RatePlan
} from "./policy";

type Db = PrismaClient | Prisma.TransactionClient;

export type ScheduleItem = { label: string; due: string; amount: number };

/**
 * A complete, final price for one rate plan. This is the ONLY place totals
 * are computed — the UI displays it, the booking stores it, and Stripe charges
 * it, so what the guest sees is exactly what they pay.
 */
export type Quote = {
  plan: RatePlan;
  nights: number;
  nightlyRates: number[]; // before plan discount
  baseSubtotal: number; // sum of nightlyRates
  discountPercent: number;
  discountAmount: number; // cents off the nightly subtotal
  discountLabel: string | null;
  subtotal: number; // nightly subtotal after discount
  cleaningFee: number;
  taxRate: number;
  taxTotal: number;
  total: number;
  /** Long stays only: exact charges in order. Payment 1 is charged at booking. */
  schedule: ScheduleItem[] | null;
  monthly: {
    fullMonths: number;
    proratedNights: number;
    monthCharge: number; // each full month, incl. tax
    finalCharge: number | null; // last partial month, incl. tax
    firstCharge: number; // payment 1 = month 1 + cleaning fee, incl. tax
    totalPayments: number;
    secondPaymentDate: string | null; // ISO date; later payments are monthly after this
  } | null;
};

export type QuoteSet = {
  isLongStay: boolean;
  standard: Quote; // MODERATE, or LONG_TERM_FIRM for 30+ nights
  nonRefundable: Quote | null;
  nonRefundableUnavailableReason: string | null;
};

export function nonRefundableEligibility(
  checkIn: Date,
  checkOut: Date,
  nights: number,
  paymentsEnabled: boolean,
  now: Date = new Date()
): string | null {
  if (nights >= LONG_STAY_NIGHTS) return "Long stays already include an 18% discount.";
  if (!paymentsEnabled) return "Only available when paying online.";
  const today = startOfDay(now);
  if (differenceInCalendarDays(checkIn, today) < NON_REFUNDABLE_MIN_DAYS_BEFORE_CHECKIN)
    return `Only available when check-in is at least ${NON_REFUNDABLE_MIN_DAYS_BEFORE_CHECKIN} days away.`;
  if (differenceInCalendarDays(checkOut, today) >= NON_REFUNDABLE_MAX_DAYS_TO_CHECKOUT)
    return `Only available for stays ending within ${NON_REFUNDABLE_MAX_DAYS_TO_CHECKOUT} days of booking.`;
  return null;
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export async function getQuotes(
  propertyId: string,
  checkIn: Date,
  checkOut: Date,
  opts: { paymentsEnabled: boolean; db?: Db; now?: Date }
): Promise<QuoteSet> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const b = await calculatePrice(propertyId, checkIn, checkOut, db, now);
  const isLongStay = b.nights >= LONG_STAY_NIGHTS;

  const common = {
    nights: b.nights,
    nightlyRates: b.nightlyRates,
    baseSubtotal: b.subtotal,
    cleaningFee: b.cleaningFee,
    taxRate: b.taxRate
  };

  if (isLongStay) {
    return {
      isLongStay,
      standard: longStayQuote(common, checkIn),
      nonRefundable: null,
      nonRefundableUnavailableReason: nonRefundableEligibility(checkIn, checkOut, b.nights, opts.paymentsEnabled, now)
    };
  }

  const standard: Quote = {
    ...common,
    plan: "MODERATE",
    discountPercent: 0,
    discountAmount: 0,
    discountLabel: null,
    subtotal: b.subtotal,
    taxTotal: b.taxTotal,
    total: b.total,
    schedule: null,
    monthly: null
  };

  const reason = nonRefundableEligibility(checkIn, checkOut, b.nights, opts.paymentsEnabled, now);
  let nonRefundable: Quote | null = null;
  if (!reason) {
    const discountAmount = Math.round(b.subtotal * (NON_REFUNDABLE_DISCOUNT_PERCENT / 100));
    const subtotal = b.subtotal - discountAmount;
    const taxTotal = Math.round((subtotal + b.cleaningFee) * b.taxRate);
    nonRefundable = {
      ...common,
      plan: "NON_REFUNDABLE",
      discountPercent: NON_REFUNDABLE_DISCOUNT_PERCENT,
      discountAmount,
      discountLabel: `Non-refundable discount (${NON_REFUNDABLE_DISCOUNT_PERCENT}%)`,
      subtotal,
      taxTotal,
      total: subtotal + b.cleaningFee + taxTotal,
      schedule: null,
      monthly: null
    };
  }

  return { isLongStay, standard, nonRefundable, nonRefundableUnavailableReason: reason };
}

/**
 * 30+ nights: 18% off the nightly subtotal, billed monthly.
 *  - Payment 1 (at booking): first 30 nights + cleaning fee, incl. tax.
 *  - Then one payment per further 30 nights; the last one is prorated for
 *    the remaining nights. Payment 2 is due 30 days after check-in, then
 *    monthly. Rent amounts are adjusted by cents so the schedule sums exactly.
 */
function longStayQuote(
  c: { nights: number; nightlyRates: number[]; baseSubtotal: number; cleaningFee: number; taxRate: number },
  checkIn: Date
): Quote {
  const discounted = Math.round(c.baseSubtotal * (1 - LONG_STAY_DISCOUNT_PERCENT / 100));
  const fullMonths = Math.floor(c.nights / 30);
  const proratedNights = c.nights % 30;
  const perNight = discounted / c.nights;

  let monthRent = Math.round(perNight * 30);
  let finalRent = 0;
  if (proratedNights > 0) {
    finalRent = discounted - monthRent * fullMonths;
  } else {
    monthRent = Math.round(discounted / fullMonths); // whole months: split evenly
  }
  const subtotal = monthRent * fullMonths + finalRent;

  const tax = (cents: number) => Math.round(cents * c.taxRate);
  const monthCharge = monthRent + tax(monthRent);
  const finalCharge = proratedNights > 0 ? finalRent + tax(finalRent) : null;
  const cleaningCharge = c.cleaningFee + tax(c.cleaningFee);
  const firstCharge = monthCharge + cleaningCharge;
  const totalPayments = fullMonths + (proratedNights > 0 ? 1 : 0);

  const secondDate = addDays(startOfDay(checkIn), 30);
  const schedule: ScheduleItem[] = [
    { label: "Payment 1 — first 30 nights + cleaning fee", due: "At booking", amount: firstCharge }
  ];
  for (let i = 2; i <= fullMonths; i++) {
    schedule.push({
      label: `Payment ${i} — nights ${(i - 1) * 30 + 1}–${i * 30}`,
      due: fmtDate(addMonths(secondDate, i - 2)),
      amount: monthCharge
    });
  }
  if (finalCharge !== null) {
    schedule.push({
      label: `Payment ${totalPayments} — final ${proratedNights} night${proratedNights > 1 ? "s" : ""} (prorated)`,
      due: fmtDate(addMonths(secondDate, totalPayments - 2)),
      amount: finalCharge
    });
  }

  const total = schedule.reduce((s, p) => s + p.amount, 0);
  return {
    ...c,
    plan: "LONG_TERM_FIRM",
    discountPercent: LONG_STAY_DISCOUNT_PERCENT,
    discountAmount: c.baseSubtotal - subtotal,
    discountLabel: `Long-stay discount (${LONG_STAY_DISCOUNT_PERCENT}%)`,
    subtotal,
    taxTotal: total - subtotal - c.cleaningFee,
    total,
    schedule,
    monthly: {
      fullMonths,
      proratedNights,
      monthCharge,
      finalCharge,
      firstCharge,
      totalPayments,
      secondPaymentDate: totalPayments > 1 ? fmtDate(secondDate) : null
    }
  };
}
