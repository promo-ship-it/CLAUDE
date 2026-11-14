import { NextRequest, NextResponse } from "next/server";
import { createPendingBooking, BookingError } from "@/lib/booking";
import { bookingRequestSchema, firstIssue } from "@/lib/booking-request";
import { createCheckoutSession } from "@/lib/payments";
import { stripeEnabled } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { LONG_STAY_NIGHTS } from "@/lib/policy";
import { nightsCount } from "@/lib/pricing";

// Online payment: creates a PENDING booking at the quoted price and returns a
// Stripe Checkout URL. The booking is confirmed by the Stripe webhook.
export async function POST(req: NextRequest) {
  if (!stripeEnabled) return NextResponse.json({ error: "Online payment is not enabled" }, { status: 400 });

  const parsed = bookingRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const d = parsed.data;

  const isLongStay = nightsCount(new Date(d.checkIn), new Date(d.checkOut)) >= LONG_STAY_NIGHTS;
  if (isLongStay && !d.authorizeRecurring) {
    return NextResponse.json({ error: "You must authorize the monthly payments to book a long stay." }, { status: 400 });
  }
  if (d.plan === "NON_REFUNDABLE" && !d.acceptedNonRefundable) {
    return NextResponse.json({ error: "Please confirm you understand the non-refundable rate." }, { status: 400 });
  }

  let bookingId: string | null = null;
  try {
    const { booking, property, quote } = await createPendingBooking({
      slug: d.slug,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      guests: d.guests,
      guest: { name: d.name, email: d.email, phone: d.phone, notes: d.notes },
      requestedPlan: d.plan,
      paymentsEnabled: true,
      paymentType: "STRIPE"
    });
    bookingId = booking.id;
    const session = await createCheckoutSession(booking, property, quote);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    // Don't hold the dates if Stripe failed before the guest could pay.
    if (bookingId) {
      await prisma.booking
        .update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationNote: "Checkout could not be started." } })
        .catch(() => {});
    }
    return NextResponse.json({ error: "Something went wrong starting payment. Please try again." }, { status: 500 });
  }
}
