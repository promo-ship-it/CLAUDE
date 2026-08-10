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

  switch (event.type) {
    // One-time payment completed OR subscription first payment completed
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;
      if (!bookingId) break;

      if (session.mode === "subscription") {
        // Recurring: store subscription ID and confirm booking
        const subscriptionId = session.subscription as string;
        const booking = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: "CONFIRMED",
            stripeSubscriptionId: subscriptionId
          },
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
      } else {
        // One-time payment: confirm booking
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
      break;
    }

    // Recurring payment succeeded (monthly invoice paid)
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) break;

      // Find the booking by subscription ID
      const booking = await prisma.booking.findFirst({
        where: { stripeSubscriptionId: subscriptionId }
      });

      if (booking) {
        console.log(
          `[subscription:payment] Booking ${booking.id} — invoice ${invoice.id} paid (${formatCents(invoice.amount_paid)})`
        );
      }
      break;
    }

    // Recurring payment failed
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) break;

      const booking = await prisma.booking.findFirst({
        where: { stripeSubscriptionId: subscriptionId }
      });

      if (booking) {
        console.error(
          `[subscription:failed] Booking ${booking.id} — invoice ${invoice.id} payment failed`
        );
        // Optionally: mark booking as at-risk, send notification, etc.
        // For now we just log it — Stripe will retry automatically per your retry settings
      }
      break;
    }

    // Subscription cancelled (guest cancelled or all payments completed)
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;

      const booking = await prisma.booking.findFirst({
        where: { stripeSubscriptionId: subscription.id }
      });

      if (booking) {
        // If the stay is complete (checkout date has passed), mark as COMPLETED
        const now = new Date();
        if (booking.checkOut <= now) {
          await prisma.booking.update({
            where: { id: booking.id },
            data: { status: "COMPLETED" }
          });
          console.log(`[subscription:completed] Booking ${booking.id} — subscription ended, stay completed`);
        } else {
          // Subscription cancelled before stay is over — flag it
          console.warn(`[subscription:cancelled] Booking ${booking.id} — subscription cancelled early`);
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
