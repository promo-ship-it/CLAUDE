import type { PrismaClient, Prisma, SmartPricingRule } from "@prisma/client";
import { startOfMonth, endOfMonth, differenceInCalendarDays, addDays, startOfDay } from "date-fns";

type Db = PrismaClient | Prisma.TransactionClient;

export type SmartPriceAdjustment = {
  ruleType: string;
  adjustment: number; // percentage, e.g. +20 or -15
  reason: string;
};

/**
 * Loads the property's smart pricing rules ONCE and returns a fast, in-memory
 * function that gives the percentage adjustment for any night.
 *
 * Rules stack (e.g. weekend +15% and high demand +20% = +35%); the total is
 * capped between -50% and +100%.
 *
 * `unavailable` is the set of booked/blocked ISO dates (yyyy-mm-dd), used for
 * the occupancy-based HIGH_DEMAND / LOW_DEMAND rules.
 */
export async function loadSmartPricer(
  db: Db,
  propertyId: string,
  smartPricingEnabled: boolean,
  unavailable: Set<string>,
  now: Date = new Date()
): Promise<(night: Date) => { totalAdjustment: number; applied: SmartPriceAdjustment[] }> {
  const none = () => ({ totalAdjustment: 0, applied: [] as SmartPriceAdjustment[] });
  if (!smartPricingEnabled) return none;

  const rules: SmartPricingRule[] = await db.smartPricingRule.findMany({
    where: { propertyId, active: true }
  });
  if (rules.length === 0) return none;

  const today = startOfDay(now);
  const occupancyCache = new Map<string, number>();
  const monthOccupancy = (night: Date) => {
    const key = `${night.getFullYear()}-${night.getMonth()}`;
    const cached = occupancyCache.get(key);
    if (cached !== undefined) return cached;
    const monthStart = startOfMonth(night);
    const monthEnd = endOfMonth(night);
    const totalDays = differenceInCalendarDays(monthEnd, monthStart) + 1;
    let booked = 0;
    for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) {
      if (unavailable.has(d.toISOString().slice(0, 10))) booked++;
    }
    const pct = (booked / totalDays) * 100;
    occupancyCache.set(key, pct);
    return pct;
  };

  return (night: Date) => {
    const applied: SmartPriceAdjustment[] = [];
    const daysUntilNight = differenceInCalendarDays(night, today);

    for (const rule of rules) {
      switch (rule.ruleType) {
        case "DAY_OF_WEEK": {
          // threshold = comma-separated day numbers (0=Sun … 6=Sat)
          const days = (rule.threshold || "5,6").split(",").map(Number);
          if (days.includes(night.getDay())) {
            applied.push({ ruleType: rule.ruleType, adjustment: rule.adjustment, reason: "Day-of-week" });
          }
          break;
        }
        case "LAST_MINUTE": {
          const maxDays = Number(rule.threshold || "7");
          if (daysUntilNight >= 0 && daysUntilNight <= maxDays) {
            applied.push({ ruleType: rule.ruleType, adjustment: rule.adjustment, reason: `Within ${maxDays} days` });
          }
          break;
        }
        case "FAR_OUT": {
          const minDays = Number(rule.threshold || "60");
          if (daysUntilNight >= minDays) {
            applied.push({ ruleType: rule.ruleType, adjustment: rule.adjustment, reason: `${minDays}+ days ahead` });
          }
          break;
        }
        case "HIGH_DEMAND": {
          const threshold = Number(rule.threshold || "70");
          const occ = monthOccupancy(night);
          if (occ >= threshold) {
            applied.push({ ruleType: rule.ruleType, adjustment: rule.adjustment, reason: `${Math.round(occ)}% booked` });
          }
          break;
        }
        case "LOW_DEMAND": {
          const threshold = Number(rule.threshold || "30");
          const occ = monthOccupancy(night);
          if (occ < threshold) {
            applied.push({ ruleType: rule.ruleType, adjustment: rule.adjustment, reason: `${Math.round(occ)}% booked` });
          }
          break;
        }
      }
    }

    const raw = applied.reduce((sum, a) => sum + a.adjustment, 0);
    return { totalAdjustment: Math.max(-50, Math.min(100, raw)), applied };
  };
}

/**
 * Apply a percentage adjustment to a nightly rate (cents), round to the
 * nearest whole dollar, and enforce the property's floor/ceiling.
 */
export function applyAdjustment(
  basePriceCents: number,
  adjustmentPercent: number,
  minPrice?: number | null,
  maxPrice?: number | null
): number {
  const adjusted = basePriceCents * (1 + adjustmentPercent / 100);
  let rate = Math.round(adjusted / 100) * 100;
  if (minPrice && rate < minPrice) rate = minPrice;
  if (maxPrice && rate > maxPrice) rate = maxPrice;
  return rate;
}
