import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { manageBookingPath } from "@/lib/booking";
import { createCardSetupSession } from "@/lib/damages";
import { SITE } from "@/lib/config";

// GET /api/bookings/:id/save-card?t=<booking token> — the link in the
// "please add a card" email. Opens Stripe's secure page to save a card
// (Checkout in setup mode). Nothing is charged. Saving a new card replaces
// the old one (used when a security hold or damage charge failed).
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const token = req.nextUrl.searchParams.get("t");
  const b = await prisma.booking.findUnique({ where: { id }, include: { property: true } });
  if (!b || !b.messageToken || token !== b.messageToken) {
    return NextResponse.json({ error: "This link is invalid." }, { status: 401 });
  }
  const back = `${SITE.url}${manageBookingPath(b, b.property.slug)}`;
  if (!SITE.paymentsEnabled) return NextResponse.redirect(back, 303);
  try {
    return NextResponse.redirect(await createCardSetupSession(b), 303);
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(back, 303);
  }
}
