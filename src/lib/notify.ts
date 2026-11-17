import { format } from "date-fns";
import type { Booking, Property } from "@prisma/client";
import { sendBookingEmails } from "./email";
import { formatCents } from "./format";
import { SITE } from "./config";
import { manageBookingPath } from "./booking";
import { DEPOSIT_PLACE_DAYS_BEFORE, DEPOSIT_RELEASE_DAYS, POLICY_NAMES, POLICY_SUMMARIES, type RatePlan } from "./policy";
import type { ScheduleItem } from "./quote";

/** Sends the guest + owner booking emails (request received / confirmed). */
export async function notifyBooking(booking: Booking, property: Property, status: "PENDING" | "CONFIRMED") {
  const plan = booking.cancellationPolicy as RatePlan;
  const schedule: ScheduleItem[] | null = booking.paymentSchedule ? JSON.parse(booking.paymentSchedule) : null;
  await sendBookingEmails({
    status,
    guestEmail: booking.guestEmail,
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    propertyName: property.name,
    checkIn: format(booking.checkIn, "MMM d, yyyy"),
    checkOut: format(booking.checkOut, "MMM d, yyyy"),
    total: formatCents(booking.total),
    policyName: POLICY_NAMES[plan],
    policySummary: POLICY_SUMMARIES[plan],
    manageUrl: `${SITE.url}${manageBookingPath(booking, property.slug)}`,
    schedule: schedule?.map((s) => ({ label: s.label, due: s.due, amount: formatCents(s.amount) })) ?? null,
    depositLine: booking.depositAmount
      ? `Security hold: a refundable ${formatCents(booking.depositAmount)} hold (not a charge) will be placed on your card ` +
        `${DEPOSIT_PLACE_DAYS_BEFORE} day before check-in and released ${DEPOSIT_RELEASE_DAYS} days after check-out unless damage is reported.`
      : null
  });
}
