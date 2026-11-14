import { NextRequest, NextResponse } from "next/server";
import { createPendingBooking, BookingError, manageBookingPath } from "@/lib/booking";
import { bookingRequestSchema, firstIssue } from "@/lib/booking-request";
import { notifyBooking } from "@/lib/notify";

// Request-to-book (used when Stripe isn't configured): creates a PENDING
// booking the host confirms from /admin/bookings. No money is collected, so
// the non-refundable rate isn't offered here.
export async function POST(req: NextRequest) {
  const parsed = bookingRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const d = parsed.data;
  if (d.plan === "NON_REFUNDABLE") {
    return NextResponse.json({ error: "The non-refundable rate requires online payment." }, { status: 400 });
  }

  try {
    const { booking, property } = await createPendingBooking({
      slug: d.slug,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      guests: d.guests,
      guest: { name: d.name, email: d.email, phone: d.phone, notes: d.notes },
      requestedPlan: "STANDARD",
      paymentsEnabled: false,
      paymentType: "INQUIRY"
    });
    await notifyBooking(booking, property, "PENDING");
    return NextResponse.json({ bookingId: booking.id, redirect: manageBookingPath(booking, property.slug) });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
