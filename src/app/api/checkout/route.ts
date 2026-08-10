import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPendingBooking, BookingError } from "@/lib/booking";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { SITE } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { calculatePaymentPlan, RECURRING_THRESHOLD_NIGHTS } from "@/lib/recurring-pricing";

const schema = z.object({
  slug: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  authorizeRecurring: z.boolean().optional()
});

export async function POST(req: NextRequest) {
  if (!stripeEnabled || !stripe) {
    return NextResponse.json({ error: "Online payment is not enabled" }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking details" }, { status: 400 });
  }
  const { slug, checkIn, checkOut, guests, name, email, phone, notes, authorizeRecurring } = parsed.data;

  try {
    const { booking, property, breakdown } = await createPendingBooking(
      slug,
      checkIn,
      checkOut,
      guests,
      { name, email, phone, notes },
      "STRIPE" // will update to STRIPE_RECURRING after we check the plan
    );

    const plan = calculatePaymentPlan(breakdown);

    if (plan.isRecurring) {
      // For recurring: require explicit authorization
      if (!authorizeRecurring) {
        // Clean up the pending booking since they haven't authorized
        await prisma.booking.delete({ where: { id: booking.id } });
        return NextResponse.json(
          { error: "You must authorize recurring monthly payments to proceed." },
          { status: 400 }
        );
      }

      // Create a Stripe Checkout in subscription mode
      // We use a price created on-the-fly for the monthly amount
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: plan.monthlyRate,
              recurring: { interval: "month" },
              product_data: {
                name: `${property.name} — Monthly stay`,
                description: `${checkIn} to ${checkOut} (${plan.totalPayments} payments)`
              }
            },
            quantity: 1
          }
        ],
        subscription_data: {
          metadata: {
            bookingId: booking.id,
            totalPayments: String(plan.totalPayments),
            proratedAmount: String(plan.proratedAmount),
            proratedNights: String(plan.proratedNights)
          }
        },
        metadata: { bookingId: booking.id, paymentType: "recurring" },
        success_url: `${SITE.url}/book/${slug}/confirmation?bookingId=${booking.id}`,
        cancel_url: `${SITE.url}/properties/${slug}`
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          stripeSessionId: session.id,
          paymentType: "STRIPE_RECURRING",
          monthlyAmount: plan.monthlyRate,
          totalPayments: plan.totalPayments,
          proratedFinal: plan.proratedAmount > 0 ? plan.proratedAmount : null
        }
      });

      return NextResponse.json({ url: session.url });
    } else {
      // Standard one-time payment (existing flow)
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: breakdown.total,
              product_data: {
                name: `${property.name} — ${breakdown.nights} night${breakdown.nights > 1 ? "s" : ""}`,
                description: `${checkIn} to ${checkOut}`
              }
            },
            quantity: 1
          }
        ],
        metadata: { bookingId: booking.id, paymentType: "one-time" },
        success_url: `${SITE.url}/book/${slug}/confirmation?bookingId=${booking.id}`,
        cancel_url: `${SITE.url}/properties/${slug}`
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: { stripeSessionId: session.id }
      });

      return NextResponse.json({ url: session.url });
    }
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
