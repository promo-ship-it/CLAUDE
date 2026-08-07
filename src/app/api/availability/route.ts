import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculatePrice, getUnavailableDates, isRangeAvailable, nightsCount } from "@/lib/pricing";
import { z } from "zod";

// GET /api/availability?slug=xxx — returns blocked dates so the UI can gray them out
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const property = await prisma.property.findUnique({ where: { slug } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const unavailable = await getUnavailableDates(property.id);
  return NextResponse.json({
    unavailableDates: Array.from(unavailable),
    minNights: property.minNights,
    maxGuests: property.maxGuests
  });
}

const checkSchema = z.object({
  slug: z.string(),
  checkIn: z.string(),
  checkOut: z.string()
});

// POST /api/availability — checks a specific date range and returns price breakdown
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = checkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { slug, checkIn, checkOut } = parsed.data;
  const property = await prisma.property.findUnique({ where: { slug } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const nights = nightsCount(inDate, outDate);

  if (nights < 1) {
    return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
  }
  if (nights < property.minNights) {
    return NextResponse.json(
      { error: `Minimum stay is ${property.minNights} nights` },
      { status: 400 }
    );
  }

  const { available, conflicts } = await isRangeAvailable(property.id, inDate, outDate);
  if (!available) {
    return NextResponse.json({ available: false, conflicts }, { status: 200 });
  }

  const breakdown = await calculatePrice(property.id, inDate, outDate);
  return NextResponse.json({ available: true, breakdown });
}
