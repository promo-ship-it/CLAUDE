import { prisma } from "./prisma";
import { getUnavailableDates } from "./pricing";
import { startOfMonth, endOfMonth, differenceInCalendarDays, addDays, startOfDay } from "date-fns";

export type SmartPriceAdjustment = {
  ruleType: string;
  adjustment: number; // percentage, e.g. +20 or -15
  reason: string;
};

/**
 * Calculate smart pricing adjustments for a specific night.
 * Returns the combined percentage adjustment to apply to the base/seasonal rate.
 *
 * Rules stack — e.g. a weekend night that's also high-demand could get +15% + +10% = +25%.
 * But total adjustment is capped at -50% to +100% to prevent extreme prices.
 */
export async function getSmartPriceAdjustment(
  propertyId: string,
  night: Date
): Promise<{ totalAdjustment: number; applied: SmartPriceAdjustment[] }> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { smartPricingEnabled: true }
  });

  if (!property?.smartPricingEnabled) {
    return { totalAdjustment: 0, applied: [] };
  }

  const rules = await prisma.smartPricingRule.findMany({
    where: { propertyId, active: true }
  });

  if (rules.length === 0) {
    return { totalAdjustment: 0, applied: [] };
  }

  const applied: SmartPriceAdjustment[] = [];
  const today = startOfDay(new Date());
  const daysUntilNight = differenceInCalendarDays(night, today);

  for (const rule of rules) {
    switch (rule.ruleType) {
      case "DAY_OF_WEEK": {
        // threshold = comma-separated day numbers (0=Sun, 1=Mon, ..., 6=Sat)
        const days = (rule.threshold || "5,6").split(",").map(Number);
        if (days.includes(night.getDay())) {
          applied.push({
            ruleType: "DAY_OF_WEEK",
            adjustment: rule.adjustment,
            reason: `Weekend/day-of-week adjustment`
          });
        }
        break;
      }

      case "LAST_MINUTE": {
        // threshold = max days before check-in (e.g. "7" means within 7 days)
        const maxDays = Number(rule.threshold || "7");
        if (daysUntilNight >= 0 && daysUntilNight <= maxDays) {
          applied.push({
            ruleType: "LAST_MINUTE",
            adjustment: rule.adjustment,
            reason: `Last-minute (within ${maxDays} days)`
          });
        }
        break;
      }

      case "FAR_OUT": {
        // threshold = min days before check-in (e.g. "60" means 60+ days out)
        const minDays = Number(rule.threshold || "60");
        if (daysUntilNight >= minDays) {
          applied.push({
            ruleType: "FAR_OUT",
            adjustment: rule.adjustment,
            reason: `Far-out booking (${minDays}+ days ahead)`
          });
        }
        break;
      }

      case "HIGH_DEMAND": {
        // threshold = occupancy percentage (e.g. "70" means when 70%+ of the month is booked)
        const threshold = Number(rule.threshold || "70");
        const occupancy = await getMonthOccupancy(propertyId, night);
        if (occupancy >= threshold) {
          applied.push({
            ruleType: "HIGH_DEMAND",
            adjustment: rule.adjustment,
            reason: `High demand (${Math.round(occupancy)}% booked this month)`
          });
        }
        break;
      }

      case "LOW_DEMAND": {
        // threshold = occupancy percentage (e.g. "30" means when less than 30% of the month is booked)
        const threshold = Number(rule.threshold || "30");
        const occupancy = await getMonthOccupancy(propertyId, night);
        if (occupancy < threshold) {
          applied.push({
            ruleType: "LOW_DEMAND",
            adjustment: rule.adjustment,
            reason: `Low demand (${Math.round(occupancy)}% booked this month)`
          });
        }
        break;
      }
    }
  }

  // Sum adjustments, cap between -50% and +100%
  const rawTotal = applied.reduce((sum, a) => sum + a.adjustment, 0);
  const totalAdjustment = Math.max(-50, Math.min(100, rawTotal));

  return { totalAdjustment, applied };
}

/**
 * Calculate what percentage of a month is already booked/blocked for a property.
 * Used by HIGH_DEMAND and LOW_DEMAND rules.
 */
async function getMonthOccupancy(propertyId: string, night: Date): Promise<number> {
  const monthStart = startOfMonth(night);
  const monthEnd = endOfMonth(night);
  const totalDays = differenceInCalendarDays(monthEnd, monthStart) + 1;

  const unavailable = await getUnavailableDates(propertyId);

  let bookedDays = 0;
  let cursor = monthStart;
  while (cursor <= monthEnd) {
    const iso = cursor.toISOString().slice(0, 10);
    if (unavailable.has(iso)) bookedDays++;
    cursor = addDays(cursor, 1);
  }

  return (bookedDays / totalDays) * 100;
}

/**
 * Apply smart pricing adjustment to a base rate (in cents).
 * Enforces min/max price guardrails if provided.
 * Returns the adjusted rate.
 */
export function applyAdjustment(
  basePriceCents: number,
  adjustmentPercent: number,
  minPrice?: number | null,
  maxPrice?: number | null
): number {
  const adjusted = basePriceCents * (1 + adjustmentPercent / 100);
  // Round to nearest 100 cents ($1) for clean pricing
  let rate = Math.round(adjusted / 100) * 100;

  // Enforce floor and ceiling
  if (minPrice && rate < minPrice) rate = minPrice;
  if (maxPrice && rate > maxPrice) rate = maxPrice;

  return rate;
}
