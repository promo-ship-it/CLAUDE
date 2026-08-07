import { prisma } from "./prisma";
import { calculatePrice, isRangeAvailable, nightsCount } from "./pricing";

export type GuestInfo = {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
};

export class BookingError extends Error {}

/**
 * Validates availability + creates a PENDING booking. Used by both the
 * inquiry flow and the Stripe checkout flow (payment confirms it later).
 */
export async function createPendingBooking(
  propertySlug: string,
  checkIn: string,
  checkOut: string,
  guests: number,
  guest: GuestInfo,
  paymentType: "INQUIRY" | "STRIPE"
) {
  const property = await prisma.property.findUnique({ where: { slug: propertySlug } });
  if (!property) throw new BookingError("Property not found");

  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const nights = nightsCount(inDate, outDate);

  if (nights < property.minNights) {
    throw new BookingError(`Minimum stay is ${property.minNights} nights`);
  }
  if (guests < 1 || guests > property.maxGuests) {
    throw new BookingError(`This property sleeps up to ${property.maxGuests} guests`);
  }

  const { available } = await isRangeAvailable(property.id, inDate, outDate);
  if (!available) throw new BookingError("Those dates are no longer available");

  const breakdown = await calculatePrice(property.id, inDate, outDate);

  const booking = await prisma.booking.create({
    data: {
      propertyId: property.id,
      guestName: guest.name,
      guestEmail: guest.email,
      guestPhone: guest.phone,
      notes: guest.notes,
      checkIn: inDate,
      checkOut: outDate,
      guests,
      nights: breakdown.nights,
      subtotal: breakdown.subtotal,
      cleaningFee: breakdown.cleaningFee,
      taxTotal: breakdown.taxTotal,
      total: breakdown.total,
      paymentType,
      status: "PENDING"
    }
  });

  return { booking, property, breakdown };
}
