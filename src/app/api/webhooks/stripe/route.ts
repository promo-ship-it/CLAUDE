import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendBookingEmails } from "@/lib/email";
import { formatCents } from "@/lib/pricing";
import { format } from "date-fns";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  if (!stripe) return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(body, sig || "", webhookSecret)
      : (JSON.parse(body) as Stripe.Event); // allows local testing without a signed secret
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId;
    if (bookingId) {
      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: { status: "CONFIRMED" },
        include: { property: true }
      });

      await sendBookingEmails({
        guestEmail: booking.guestEmail,
        guestName: booking.guestName,
        propertyName: booking.property.name,
        checkIn: format(booking.checkIn, "MMM d, yyyy"),
        checkOut: format(booking.checkOut, "MMM d, yyyy"),
        total: formatCents(booking.total),
        status: "CONFIRMED"
      });
    }
  }

  return NextResponse.json({ received: true });
}
