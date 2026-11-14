import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUnavailableDates, isRangeAvailable, nightsCount } from "@/lib/pricing";
import { getQuotes } from "@/lib/quote";
import { SITE } from "@/lib/config";
import { z } from "zod";

// GET /api/availability?slug=xxx — blocked dates so the calendar can gray them out
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const property = await prisma.property.findUnique({ where: { slug } });
  if (!property || !property.active) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const unavailable = await getUnavailableDates(property.id);
  return NextResponse.json({
    unavailableDates: Array.from(unavailable),
    minNights: property.minNights,
    maxGuests: property.maxGuests
  });
}

const checkSchema = z.object({ slug: z.string(), checkIn: z.string(), checkOut: z.string() });

// POST /api/availability — checks a date range and returns the final price
// for every rate plan the guest can choose (standard / non-refundable / long-stay).
export async function POST(req: NextRequest) {
  const parsed = checkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { slug, checkIn, checkOut } = parsed.data;
  const property = await prisma.property.findUnique({ where: { slug } });
  if (!property || !property.active) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }
  const nights = nightsCount(inDate, outDate);
  if (nights < 1) return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
  if (nights < property.minNights) {
    return NextResponse.json({ error: `Minimum stay is ${property.minNights} nights` }, { status: 400 });
  }

  const { available, conflicts } = await isRangeAvailable(property.id, inDate, outDate);
  if (!available) return NextResponse.json({ available: false, conflicts });

  const quotes = await getQuotes(property.id, inDate, outDate, { paymentsEnabled: SITE.paymentsEnabled });
  return NextResponse.json({
    available: true,
    paymentsEnabled: SITE.paymentsEnabled,
    basePrice: property.basePrice,
    smartPricingEnabled: property.smartPricingEnabled,
    quotes
  });
}
