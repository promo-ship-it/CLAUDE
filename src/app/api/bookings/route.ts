import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPendingBooking, BookingError } from "@/lib/booking";
import { sendBookingEmails } from "@/lib/email";
import { formatCents } from "@/lib/pricing";
import { format } from "date-fns";

const schema = z.object({
  slug: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  notes: z.string().optional()
});

// Used when Stripe isn't configured — creates a "Request to Book" inquiry.
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking details" }, { status: 400 });
  }
  const { slug, checkIn, checkOut, guests, name, email, phone, notes } = parsed.data;

  try {
    const { booking, property } = await createPendingBooking(
      slug,
      checkIn,
      checkOut,
      guests,
      { name, email, phone, notes },
      "INQUIRY"
    );

    await sendBookingEmails({
      guestEmail: email,
      guestName: name,
      propertyName: property.name,
      checkIn: format(booking.checkIn, "MMM d, yyyy"),
      checkOut: format(booking.checkOut, "MMM d, yyyy"),
      total: formatCents(booking.total),
      status: "PENDING"
    });

    return NextResponse.json({ bookingId: booking.id });
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
