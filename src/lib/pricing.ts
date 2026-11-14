import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { addDays, differenceInCalendarDays, isBefore, isEqual, startOfDay, subMinutes } from "date-fns";
import { loadSmartPricer, applyAdjustment } from "./smart-pricing";
import { LONG_STAY_NIGHTS, PENDING_PAYMENT_HOLD_MINUTES } from "./policy";

// Re-exported for server code that imports formatCents from here. Client
// components must import from "@/lib/format" (this file pulls in Prisma).
export { formatCents } from "./format";

type Db = PrismaClient | Prisma.TransactionClient;

export type PriceBreakdown = {
  nights: number;
  nightlyRates: number[]; // cents, one per night, in order (before any plan discount)
  subtotal: number; // cents — sum of nightlyRates
  cleaningFee: number; // cents
  taxRate: number; // e.g. 0.08
  taxTotal: number; // cents
  total: number; // cents
};

/** Every night stayed: from check-in up to (not including) checkout. */
export function nightsBetween(checkIn: Date, checkOut: Date): Date[] {
  const nights: Date[] = [];
  let cursor = startOfDay(checkIn);
  const end = startOfDay(checkOut);
  while (isBefore(cursor, end)) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nights;
}

export function nightsCount(checkIn: Date, checkOut: Date): number {
  return differenceInCalendarDays(checkOut, checkIn);
}

/**
 * Bookings that hold dates: confirmed ones, request-to-book inquiries awaiting
 * the host, and Stripe checkouts started in the last PENDING_PAYMENT_HOLD_MINUTES
 * (abandoned checkouts stop blocking dates automatically).
 */
export function activeBookingWhere(now: Date = new Date()): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: "CONFIRMED" },
      {
        status: "PENDING",
        OR: [
          { paymentType: "INQUIRY" },
          { createdAt: { gte: subMinutes(now, PENDING_PAYMENT_HOLD_MINUTES) } }
        ]
      }
    ]
  };
}

/** ISO dates (yyyy-mm-dd) that can't be booked: active bookings + blocked/imported dates. */
export async function getUnavailableDates(
  propertyId: string,
  db: Db = prisma,
  now: Date = new Date()
): Promise<Set<string>> {
  const [bookings, blocked] = await Promise.all([
    db.booking.findMany({
      where: { propertyId, ...activeBookingWhere(now) },
      select: { checkIn: true, checkOut: true }
    }),
    db.blockedDate.findMany({ where: { propertyId }, select: { date: true } })
  ]);

  const unavailable = new Set<string>();
  for (const b of bookings) {
    for (const d of nightsBetween(b.checkIn, b.checkOut)) unavailable.add(d.toISOString().slice(0, 10));
  }
  for (const b of blocked) unavailable.add(startOfDay(b.date).toISOString().slice(0, 10));
  return unavailable;
}

export async function isRangeAvailable(
  propertyId: string,
  checkIn: Date,
  checkOut: Date,
  db: Db = prisma
): Promise<{ available: boolean; conflicts: string[] }> {
  const unavailable = await getUnavailableDates(propertyId, db);
  const conflicts = nightsBetween(checkIn, checkOut)
    .map((d) => d.toISOString().slice(0, 10))
    .filter((iso) => unavailable.has(iso));
  return { available: conflicts.length === 0, conflicts };
}

/**
 * Nightly rates for a stay: base rate → seasonal override → smart pricing
 * adjustment → floor/ceiling. For long stays (30+ nights) only smart-pricing
 * SURCHARGES apply; the long-stay discount replaces smart-pricing discounts
 * (they never stack). Plan discounts (non-refundable / long-stay) are applied
 * afterwards in quote.ts.
 *
 * Runs a fixed number of queries regardless of stay length.
 */
export async function calculatePrice(
  propertyId: string,
  checkIn: Date,
  checkOut: Date,
  db: Db = prisma,
  now: Date = new Date()
): Promise<PriceBreakdown> {
  const property = await db.property.findUniqueOrThrow({ where: { id: propertyId } });
  const [rules, unavailable] = await Promise.all([
    db.priceRule.findMany({ where: { propertyId } }),
    property.smartPricingEnabled ? getUnavailableDates(propertyId, db, now) : Promise.resolve(new Set<string>())
  ]);
  const smartPrice = await loadSmartPricer(db, propertyId, property.smartPricingEnabled, unavailable, now);

  const nights = nightsBetween(checkIn, checkOut);
  const isLongStay = nights.length >= LONG_STAY_NIGHTS;

  const nightlyRates = nights.map((night) => {
    const rule = rules.find(
      (r) =>
        (isBefore(r.startDate, night) || isEqual(startOfDay(r.startDate), night)) &&
        isBefore(night, r.endDate)
    );
    const rate = rule ? rule.price : property.basePrice;
    const { totalAdjustment } = smartPrice(night);
    const adjustment = isLongStay ? Math.max(0, totalAdjustment) : totalAdjustment;
    if (adjustment !== 0) return applyAdjustment(rate, adjustment, property.minPrice, property.maxPrice);
    let clamped = rate;
    if (property.minPrice && clamped < property.minPrice) clamped = property.minPrice;
    if (property.maxPrice && clamped > property.maxPrice) clamped = property.maxPrice;
    return clamped;
  });

  const subtotal = nightlyRates.reduce((sum, n) => sum + n, 0);
  const cleaningFee = property.cleaningFee;
  const taxTotal = Math.round((subtotal + cleaningFee) * property.taxRate);

  return {
    nights: nights.length,
    nightlyRates,
    subtotal,
    cleaningFee,
    taxRate: property.taxRate,
    taxTotal,
    total: subtotal + cleaningFee + taxTotal
  };
}
