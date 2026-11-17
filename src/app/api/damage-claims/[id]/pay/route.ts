import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { manageBookingPath } from "@/lib/booking";
import { createDamagePaymentSession } from "@/lib/damages";
import { SITE } from "@/lib/config";

// GET /api/damage-claims/:id/pay?t=<booking token> — the link in the
// "payment needed" email. Creates a fresh Stripe Checkout page each time,
// so the emailed link never expires.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const token = req.nextUrl.searchParams.get("t");
  const claim = await prisma.damageClaim.findUnique({ where: { id }, include: { booking: { include: { property: true } } } });
  const b = claim?.booking;
  if (!claim || !b || !b.messageToken || token !== b.messageToken) {
    return NextResponse.json({ error: "This link is invalid." }, { status: 401 });
  }
  const back = `${SITE.url}${manageBookingPath(b, b.property.slug)}`;
  if (claim.status !== "PAYMENT_LINK_SENT") return NextResponse.redirect(back, 303);
  try {
    return NextResponse.redirect(await createDamagePaymentSession(claim, b), 303);
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(back, 303);
  }
}
