import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { getUnavailableDates, nightsBetween, nightsCount } from "./pricing";
import { getQuotes, type Quote } from "./quote";
import { TERMS_VERSION, depositAmountFor, type RatePlan } from "./policy";

export type GuestInfo = {
  name: string;
  email: string;
  phone: string;
  notes?: string;
};

export class BookingError extends Error {}

/**
 * Validates everything and creates a PENDING booking at the exact quoted
 * price for the chosen plan. Used by both request-to-book and Stripe checkout.
 *
 * Runs in a SERIALIZABLE transaction so two guests can't grab the same dates
 * at the same moment: the second one gets "those dates were just booked".
 */
export async function createPendingBooking(args: {
  slug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guest: GuestInfo;
  requestedPlan: "STANDARD" | "NON_REFUNDABLE";
  paymentsEnabled: boolean;
  paymentType: "INQUIRY" | "STRIPE";
}) {
  const property = await prisma.property.findUnique({ where: { slug: args.slug } });
  if (!property || !property.active) throw new BookingError("Property not found");

  const inDate = new Date(args.checkIn);
  const outDate = new Date(args.checkOut);
  if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) throw new BookingError("Invalid dates");
  const nights = nightsCount(inDate, outDate);
  if (nights < 1) throw new BookingError("Check-out must be after check-in");
  if (nights < property.minNights) throw new BookingError(`Minimum stay is ${property.minNights} nights`);
  if (args.guests < 1 || args.guests > property.maxGuests) {
    throw new BookingError(`This property sleeps up to ${property.maxGuests} guests`);
  }
  if (inDate < new Date(new Date().toISOString().slice(0, 10))) throw new BookingError("Check-in is in the past");

  try {
    return await prisma.$transaction(
      async (tx) => {
        const unavailable = await getUnavailableDates(property.id, tx);
        const conflict = nightsBetween(inDate, outDate).some((d) => unavailable.has(d.toISOString().slice(0, 10)));
        if (conflict) throw new BookingError("Those dates are no longer available");

        const quotes = await getQuotes(property.id, inDate, outDate, { paymentsEnabled: args.paymentsEnabled, db: tx });

        let quote: Quote = quotes.standard;
        if (args.requestedPlan === "NON_REFUNDABLE") {
          if (!quotes.nonRefundable) {
            throw new BookingError(quotes.nonRefundableUnavailableReason || "The non-refundable rate isn't available for these dates.");
          }
          quote = quotes.nonRefundable;
        }

        const isRecurring = quote.plan === "LONG_TERM_FIRM" && args.paymentType === "STRIPE";
        // Security hold only when paying online (a card is saved at checkout).
        const deposit = args.paymentType === "STRIPE" ? depositAmountFor(quote.nights) : 0;
        const booking = await tx.booking.create({
          data: {
            propertyId: property.id,
            guestName: args.guest.name,
            guestEmail: args.guest.email,
            guestPhone: args.guest.phone,
            notes: args.guest.notes,
            checkIn: inDate,
            checkOut: outDate,
            guests: args.guests,
            nights: quote.nights,
            subtotal: quote.subtotal,
            cleaningFee: quote.cleaningFee,
            taxTotal: quote.taxTotal,
            total: quote.total,
            discountAmount: quote.discountAmount,
            discountLabel: quote.discountLabel,
            cancellationPolicy: quote.plan as RatePlan,
            paymentType: isRecurring ? "STRIPE_RECURRING" : args.paymentType,
            monthlyAmount: quote.monthly?.monthCharge ?? null,
            totalPayments: quote.monthly?.totalPayments ?? null,
            proratedFinal: quote.monthly?.finalCharge ?? null,
            paymentSchedule: quote.schedule ? JSON.stringify(quote.schedule) : null,
            depositAmount: deposit > 0 ? deposit : null,
            depositStatus: deposit > 0 ? "SCHEDULED" : null,
            termsVersion: TERMS_VERSION,
            termsAcceptedAt: new Date(),
            status: "PENDING",
            messageToken: randomBytes(24).toString("hex")
          }
        });

        return { booking, property, quote };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }
    );
  } catch (err) {
    if (err instanceof BookingError) throw err;
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw new BookingError("Those dates were just booked by someone else. Please choose new dates.");
    }
    throw err;
  }
}

/** Link the guest uses to view/message/cancel their booking (also sent by email). */
export function manageBookingPath(b: { id: string; messageToken: string | null }, slug: string) {
  return `/book/${slug}/confirmation?bookingId=${b.id}&t=${b.messageToken ?? ""}`;
}
