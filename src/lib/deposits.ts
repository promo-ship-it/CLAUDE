// Refundable security deposit hold (Terms §5).
//
// About a day before check-in the site authorizes (holds, doesn't charge) the
// booking's deposit amount on the saved card. The hold is renewed before Stripe's
// ~7-day authorization limit runs out, kept while a damage claim is open, and
// released DEPOSIT_RELEASE_DAYS after check-out. A damage charge captures from
// the hold first. If a hold can't be placed (declined, insufficient funds,
// single-use/prepaid card, no card), the guest is emailed a link to save a
// working card and the host is alerted.
//
// runDepositJobs() is called once a day by /api/cron/daily.
import type { Booking, Property } from "@prisma/client";
import { addDays, addHours, differenceInHours, format, startOfDay } from "date-fns";
import type Stripe from "stripe";
import { prisma } from "./prisma";
import { stripe } from "./stripe";
import { SITE } from "./config";
import { manageBookingPath } from "./booking";
import { sendGuestEmail, sendOwnerAlert } from "./email";
import { formatCents } from "./format";
import { cardFailureReason, resolveSavedCard } from "./cards";
import { DEPOSIT_PLACE_DAYS_BEFORE, DEPOSIT_RELEASE_DAYS, DEPOSIT_RENEW_HOURS } from "./policy";

type BookingWithProperty = Booking & { property: Property };

const DEFAULT_HOLD_HOURS = 6 * 24 + 12; // used if Stripe doesn't report the expiry
const STALE_LOCK_MINUTES = 30;

const manageUrl = (b: BookingWithProperty) => `${SITE.url}${manageBookingPath(b, b.property.slug)}`;
const saveCardUrl = (b: Booking) => `${SITE.url}/api/bookings/${b.id}/save-card?t=${b.messageToken ?? ""}`;
const stay = (b: BookingWithProperty) =>
  `${b.property.name} (${format(b.checkIn, "MMM d")} – ${format(b.checkOut, "MMM d, yyyy")})`;

/** When the guest actually left: check-out, or the cancellation date if they left early. */
function stayEnd(b: Booking) {
  if (b.status === "CANCELLED" && b.cancelledAt && b.cancelledAt < b.checkOut) return b.cancelledAt;
  return b.checkOut;
}

/** The guest never arrived (cancelled before check-in, or never confirmed). */
function stayDidNotHappen(b: Booking) {
  if (b.status === "PENDING") return true;
  return b.status === "CANCELLED" && (!b.cancelledAt || startOfDay(b.cancelledAt) <= startOfDay(b.checkIn));
}

export function depositPlaceFrom(b: Booking) {
  return addDays(startOfDay(b.checkIn), -DEPOSIT_PLACE_DAYS_BEFORE);
}

export function depositReleaseAt(b: Booking) {
  return addDays(startOfDay(stayEnd(b)), DEPOSIT_RELEASE_DAYS);
}

async function hasOpenDamageClaim(bookingId: string) {
  return (await prisma.damageClaim.count({ where: { bookingId, status: { in: ["NOTICE_SENT", "CHARGING"] } } })) > 0;
}

async function holdExpiry(pi: Stripe.PaymentIntent, now: Date): Promise<Date> {
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const before = charge?.payment_method_details?.card?.capture_before;
  return before ? new Date(before * 1000) : addHours(now, DEFAULT_HOLD_HOURS);
}

// ── Place / renew ───────────────────────────────────────────────────────────

export type HoldResult = "HELD" | "FAILED" | "SKIPPED";

/**
 * Authorizes the deposit on the saved card. `mode: "place"` for the first hold
 * (or a retry after a failure), `"renew"` to replace an expiring hold.
 * Never throws for card problems; throws only on unexpected Stripe errors.
 */
export async function placeDepositHold(bookingId: string, mode: "place" | "renew", now = new Date()): Promise<HoldResult> {
  if (!stripe) return "SKIPPED";
  const from = mode === "place" ? (["SCHEDULED", "FAILED"] as const) : (["HELD"] as const);
  const lockStatus = mode === "place" ? "PLACING" : "RENEWING";
  const locked = await prisma.booking.updateMany({
    where: { id: bookingId, depositStatus: { in: [...from] }, depositAmount: { gt: 0 } },
    data: { depositStatus: lockStatus }
  });
  if (locked.count !== 1) return "SKIPPED";

  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { property: true } });
  const previousStatus = mode === "place" ? (b.depositNote?.startsWith("FAILED:") ? "FAILED" : "SCHEDULED") : "HELD";
  const wasFailed = previousStatus === "FAILED";

  let failure = "No card is saved for this booking.";
  try {
    const card = await resolveSavedCard(b);
    if (card) {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: b.depositAmount!,
            currency: "usd",
            customer: card.customer,
            payment_method: card.paymentMethod,
            capture_method: "manual",
            off_session: true,
            confirm: true,
            description: `Refundable security hold — ${b.property.name}`,
            metadata: { kind: "deposit", bookingId: b.id },
            expand: ["latest_charge"]
          },
          { idempotencyKey: `deposit-${b.id}-${b.depositAttempts}` }
        );
        if (pi.status === "requires_capture") {
          const oldPi = mode === "renew" ? b.depositPaymentIntentId : null;
          await prisma.booking.update({
            where: { id: b.id },
            data: {
              depositStatus: "HELD",
              depositPaymentIntentId: pi.id,
              depositHeldUntil: await holdExpiry(pi, now),
              depositAttempts: { increment: 1 },
              depositNote: null
            }
          });
          // Release the old hold only after the new one is in place.
          if (oldPi && oldPi !== pi.id) await stripe.paymentIntents.cancel(oldPi).catch(() => {});
          if (mode === "place") {
            await sendGuestEmail(
              b.guestEmail,
              `Security hold placed — ${b.property.name}`,
              `Hi ${b.guestName},\n\nAs described at booking, we've placed a refundable security hold of ${formatCents(b.depositAmount!)} on your card for ${stay(b)}. ` +
                `This is not a charge. It's released ${DEPOSIT_RELEASE_DAYS} days after check-out unless damage is reported.\n\nYour booking: ${manageUrl(b)}`
            );
          }
          return "HELD";
        }
        failure = `The card couldn't be authorized (status "${pi.status}").`;
        await stripe.paymentIntents.cancel(pi.id).catch(() => {});
      } catch (err) {
        const reason = cardFailureReason(err);
        if (!reason) throw err;
        failure = reason;
      }
    }
  } catch (err) {
    // Unexpected Stripe/API error: undo the lock, let the next run retry.
    await prisma.booking.update({ where: { id: b.id }, data: { depositStatus: previousStatus } });
    throw err;
  }

  if (mode === "renew") {
    // The current hold is still valid until it expires; keep it, notify once.
    const firstFailure = !b.depositNote?.startsWith("RENEWAL FAILED:");
    await prisma.booking.update({
      where: { id: b.id },
      data: { depositStatus: "HELD", depositAttempts: { increment: 1 }, depositNote: `RENEWAL FAILED: ${failure}` }
    });
    if (firstFailure) await notifyHoldProblem(b, failure, true);
    return "FAILED";
  }

  await prisma.booking.update({
    where: { id: b.id },
    data: { depositStatus: "FAILED", depositAttempts: { increment: 1 }, depositNote: `FAILED: ${failure}` }
  });
  if (!wasFailed) await notifyHoldProblem(b, failure, false);
  return "FAILED";
}

async function notifyHoldProblem(b: BookingWithProperty, reason: string, renewal: boolean) {
  await sendGuestEmail(
    b.guestEmail,
    `Action needed: security hold for ${b.property.name}`,
    `Hi ${b.guestName},\n\nWe couldn't ${renewal ? "renew" : "place"} the refundable security hold of ${formatCents(b.depositAmount!)} for ${stay(b)}. ` +
      `${reason}\n\nPlease save a working card (prepaid cards aren't accepted). Nothing is charged when you save it:\n${saveCardUrl(b)}\n\n` +
      `Questions? Message us from your booking page: ${manageUrl(b)}`
  );
  await sendOwnerAlert(
    renewal ? "Security hold renewal failed" : "Security hold failed",
    `Couldn't ${renewal ? "renew" : "place"} the ${formatCents(b.depositAmount!)} security hold for ${b.guestName} ` +
      `(${b.guestEmail}, ${b.guestPhone ?? "no phone"}) at ${stay(b)}: ${reason}\n` +
      `The guest was emailed a link to save a working card. You may want to hold check-in instructions until it's resolved.`
  );
}

// ── Release / capture ───────────────────────────────────────────────────────

export async function releaseDepositHold(bookingId: string, note: string, notifyGuest = true) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { property: true } });
  if (!b || !b.depositStatus) return false;
  const res = await prisma.booking.updateMany({
    where: { id: bookingId, depositStatus: { in: ["SCHEDULED", "FAILED", "HELD"] } },
    data: { depositStatus: "RELEASED", depositNote: note }
  });
  if (res.count !== 1) return false;
  const hadHold = b.depositStatus === "HELD" && b.depositPaymentIntentId;
  if (hadHold && stripe) await stripe.paymentIntents.cancel(b.depositPaymentIntentId!).catch(() => {});
  if (hadHold && notifyGuest) {
    await sendGuestEmail(
      b.guestEmail,
      `Security hold released — ${b.property.name}`,
      `Hi ${b.guestName},\n\nThe ${formatCents(b.depositAmount!)} security hold for ${stay(b)} has been released. ` +
        `Depending on your bank, it can take a few days to disappear from your statement.`
    );
  }
  return true;
}

/**
 * Takes up to `cents` from the security hold for a damage charge.
 * Returns the amount captured (0 if there's no usable hold).
 * Stripe releases any uncaptured remainder automatically.
 */
export async function captureFromDeposit(bookingId: string, cents: number): Promise<{ captured: number; paymentIntentId: string | null }> {
  if (!stripe || cents <= 0) return { captured: 0, paymentIntentId: null };
  const locked = await prisma.booking.updateMany({
    where: { id: bookingId, depositStatus: "HELD", depositPaymentIntentId: { not: null } },
    data: { depositStatus: "CAPTURING" }
  });
  if (locked.count !== 1) return { captured: 0, paymentIntentId: null };
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const amount = Math.min(cents, b.depositAmount ?? 0);
  try {
    const pi = await stripe.paymentIntents.capture(
      b.depositPaymentIntentId!,
      { amount_to_capture: amount },
      { idempotencyKey: `deposit-capture-${b.depositPaymentIntentId}-${amount}` }
    );
    if (pi.status !== "succeeded") throw Object.assign(new Error(`status ${pi.status}`), { type: "StripeInvalidRequestError" });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { depositStatus: "CAPTURED", depositCapturedAmount: amount, depositNote: `Used ${formatCents(amount)} for damages.` }
    });
    return { captured: amount, paymentIntentId: pi.id };
  } catch (err) {
    if (!cardFailureReason(err)) {
      await prisma.booking.update({ where: { id: bookingId }, data: { depositStatus: "HELD" } });
      throw err;
    }
    // The hold is no longer usable (expired or already released).
    await prisma.booking.update({
      where: { id: bookingId },
      data: { depositStatus: "FAILED", depositNote: `FAILED: The hold could no longer be captured (${(err as Error).message}).` }
    });
    return { captured: 0, paymentIntentId: null };
  }
}

// ── Daily job ───────────────────────────────────────────────────────────────

export type DepositJobSummary = { placed: number; renewed: number; released: number; failed: number; expired: number; errors: string[] };

export async function runDepositJobs(now = new Date()): Promise<DepositJobSummary> {
  const summary: DepositJobSummary = { placed: 0, renewed: 0, released: 0, failed: 0, expired: 0, errors: [] };

  // Recover locks left by a crashed run.
  const stale = new Date(now.getTime() - STALE_LOCK_MINUTES * 60 * 1000);
  await prisma.booking.updateMany({ where: { depositStatus: "PLACING", updatedAt: { lt: stale } }, data: { depositStatus: "SCHEDULED" } });
  await prisma.booking.updateMany({ where: { depositStatus: { in: ["RENEWING", "CAPTURING"] }, updatedAt: { lt: stale } }, data: { depositStatus: "HELD" } });

  const bookings = await prisma.booking.findMany({
    where: { depositAmount: { gt: 0 }, depositStatus: { in: ["SCHEDULED", "FAILED", "HELD"] } },
    include: { property: true }
  });

  for (const b of bookings) {
    try {
      if (stayDidNotHappen(b)) {
        if (b.status !== "PENDING" && (await releaseDepositHold(b.id, "Stay didn't take place.", false))) summary.released++;
        continue;
      }
      const needed = now < depositReleaseAt(b) || (await hasOpenDamageClaim(b.id));

      if (b.depositStatus === "HELD") {
        if (!needed) {
          if (await releaseDepositHold(b.id, `Released ${DEPOSIT_RELEASE_DAYS} days after check-out.`)) summary.released++;
        } else if (b.depositHeldUntil && b.depositHeldUntil <= now) {
          await prisma.booking.update({ where: { id: b.id }, data: { depositStatus: "FAILED", depositNote: "FAILED: The hold expired before it could be renewed." } });
          await notifyHoldProblem(b, "The previous hold expired before it could be renewed.", true);
          summary.expired++;
        } else if (!b.depositHeldUntil || differenceInHours(b.depositHeldUntil, now) <= DEPOSIT_RENEW_HOURS) {
          const r = await placeDepositHold(b.id, "renew", now);
          if (r === "HELD") summary.renewed++;
          else if (r === "FAILED") summary.failed++;
        }
        continue;
      }

      // SCHEDULED or FAILED
      if (!needed) {
        await releaseDepositHold(b.id, "No hold needed after the stay.", false);
        continue;
      }
      if (now >= depositPlaceFrom(b)) {
        const r = await placeDepositHold(b.id, "place", now);
        if (r === "HELD") summary.placed++;
        else if (r === "FAILED") summary.failed++;
      }
    } catch (err) {
      summary.errors.push(`${b.id}: ${(err as Error).message}`);
    }
  }
  return summary;
}

/** Called right after a booking is paid or a card is saved: place the hold now if it's already due. */
export async function placeDepositIfDue(bookingId: string, now = new Date()) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || !b.depositAmount || !b.depositStatus) return;
  if (!["SCHEDULED", "FAILED"].includes(b.depositStatus) || b.status !== "CONFIRMED") return;
  if (now < depositPlaceFrom(b) || now >= depositReleaseAt(b)) return;
  try {
    await placeDepositHold(b.id, "place", now);
  } catch (err) {
    console.error(`[deposit] couldn't place hold for ${b.id}; the daily job will retry`, err);
  }
}
