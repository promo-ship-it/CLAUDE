import { prisma } from "./prisma";
import { addDays, differenceInCalendarDays, isBefore, isEqual, startOfDay } from "date-fns";

// Re-exported for any server-side code already importing formatCents from
// here. Client components should import from "@/lib/format" instead, since
// this file pulls in Prisma (server-only) and would break the client bundle.
export { formatCents } from "./format";

export type PriceBreakdown = {
  nights: number;
  nightlyRates: number[]; // cents, one per night, in order
  subtotal: number; // cents
  cleaningFee: number; // cents
  taxTotal: number; // cents
  total: number; // cents
};

/**
 * Returns every calendar date between two dates (exclusive of checkout,
 * i.e. the nights actually stayed).
 */
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

/**
 * Set of ISO date strings (yyyy-mm-dd) that are unavailable for a property:
 * confirmed/pending bookings + manually blocked dates + imported ical dates.
 */
export async function getUnavailableDates(propertyId: string): Promise<Set<string>> {
  const [bookings, blocked] = await Promise.all([
    prisma.booking.findMany({
      where: {
        propertyId,
        status: { in: ["PENDING", "CONFIRMED"] }
      },
      select: { checkIn: true, checkOut: true }
    }),
    prisma.blockedDate.findMany({
      where: { propertyId },
      select: { date: true }
    })
  ]);

  const unavailable = new Set<string>();
  for (const b of bookings) {
    for (const d of nightsBetween(b.checkIn, b.checkOut)) {
      unavailable.add(d.toISOString().slice(0, 10));
    }
  }
  for (const b of blocked) {
    unavailable.add(startOfDay(b.date).toISOString().slice(0, 10));
  }
  return unavailable;
}

export async function isRangeAvailable(
  propertyId: string,
  checkIn: Date,
  checkOut: Date
): Promise<{ available: boolean; conflicts: string[] }> {
  const unavailable = await getUnavailableDates(propertyId);
  const wanted = nightsBetween(checkIn, checkOut);
  const conflicts = wanted
    .map((d) => d.toISOString().slice(0, 10))
    .filter((iso) => unavailable.has(iso));
  return { available: conflicts.length === 0, conflicts };
}

export async function calculatePrice(
  propertyId: string,
  checkIn: Date,
  checkOut: Date
): Promise<PriceBreakdown> {
  const { getSmartPriceAdjustment, applyAdjustment } = await import("./smart-pricing");
  const { RECURRING_THRESHOLD_NIGHTS } = await import("./recurring-pricing");

  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
  const rules = await prisma.priceRule.findMany({ where: { propertyId } });

  const nights = nightsBetween(checkIn, checkOut);
  const isLongStay = nights.length >= RECURRING_THRESHOLD_NIGHTS;

  // Calculate nightly rates with smart pricing adjustments
  const nightlyRates: number[] = [];
  for (const night of nights) {
    // First determine base/seasonal rate
    const rule = rules.find(
      (r) =>
        (isBefore(r.startDate, night) || isEqual(startOfDay(r.startDate), night)) &&
        isBefore(night, r.endDate)
    );
    let rate = rule ? rule.price : property.basePrice;

    // Apply smart pricing adjustment if enabled
    const { totalAdjustment } = await getSmartPriceAdjustment(propertyId, night);
    if (totalAdjustment !== 0) {
      // For long stays (30+ nights): only apply surcharges (positive adjustments).
      // Discounts don't stack — the 18% long-stay discount supersedes any
      // smart pricing discounts. Guest gets the better of the two, not both.
      const effectiveAdjustment = isLongStay ? Math.max(0, totalAdjustment) : totalAdjustment;
      if (effectiveAdjustment !== 0) {
        rate = applyAdjustment(rate, effectiveAdjustment, property.minPrice, property.maxPrice);
      } else {
        // Enforce guardrails even with no adjustment
        if (property.minPrice && rate < property.minPrice) rate = property.minPrice;
        if (property.maxPrice && rate > property.maxPrice) rate = property.maxPrice;
      }
    } else {
      // Even without adjustments, enforce min/max guardrails
      if (property.minPrice && rate < property.minPrice) rate = property.minPrice;
      if (property.maxPrice && rate > property.maxPrice) rate = property.maxPrice;
    }

    nightlyRates.push(rate);
  }

  const subtotal = nightlyRates.reduce((sum, n) => sum + n, 0);
  const cleaningFee = property.cleaningFee;
  const taxTotal = Math.round((subtotal + cleaningFee) * property.taxRate);
  const total = subtotal + cleaningFee + taxTotal;

  return {
    nights: nights.length,
    nightlyRates,
    subtotal,
    cleaningFee,
    taxTotal,
    total
  };
}

export function nightsCount(checkIn: Date, checkOut: Date): number {
  return differenceInCalendarDays(checkOut, checkIn);
}
