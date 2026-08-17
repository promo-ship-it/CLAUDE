import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/auth";

// POST /api/admin/setup-smart-pricing
// One-time setup: configures smart pricing rules for all properties.
// Sets base rate to $100, floor $75, ceiling $180, and adds recommended rules.
export async function POST(req: NextRequest) {
  const authed = await isAdminAuthed();
  if (!authed) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const properties = await prisma.property.findMany();

  for (const property of properties) {
    // Update base rate and price guardrails
    await prisma.property.update({
      where: { id: property.id },
      data: {
        basePrice: 10000, // $100/night
        minPrice: 7500,   // $75/night floor
        maxPrice: 18000,  // $180/night ceiling
        smartPricingEnabled: true
      }
    });

    // Remove existing smart pricing rules for a clean slate
    await prisma.smartPricingRule.deleteMany({
      where: { propertyId: property.id }
    });

    // Add recommended starter rules
    await prisma.smartPricingRule.createMany({
      data: [
        {
          propertyId: property.id,
          ruleType: "DAY_OF_WEEK",
          threshold: "5,6", // Friday & Saturday
          adjustment: 15,   // +15% on weekends
          active: true
        },
        {
          propertyId: property.id,
          ruleType: "LAST_MINUTE",
          threshold: "5",   // within 5 days of check-in
          adjustment: -10,  // -10% discount
          active: true
        },
        {
          propertyId: property.id,
          ruleType: "FAR_OUT",
          threshold: "90",  // 90+ days out
          adjustment: -5,   // -5% early bird discount
          active: true
        },
        {
          propertyId: property.id,
          ruleType: "HIGH_DEMAND",
          threshold: "70",  // when 70%+ of month is booked
          adjustment: 20,   // +20% surge
          active: true
        },
        {
          propertyId: property.id,
          ruleType: "LOW_DEMAND",
          threshold: "20",  // when less than 20% booked
          adjustment: -15,  // -15% to attract bookings
          active: true
        }
      ]
    });
  }

  return NextResponse.json({
    success: true,
    message: `Smart pricing configured for ${properties.length} properties`,
    settings: {
      baseRate: "$100/night",
      floor: "$75/night",
      ceiling: "$180/night",
      rules: [
        "Weekend (Fri/Sat): +15%",
        "Last minute (≤5 days): -10%",
        "Far out (90+ days): -5%",
        "High demand (70%+ booked): +20%",
        "Low demand (<20% booked): -15%"
      ]
    }
  });
}
