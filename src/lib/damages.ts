// Post-checkout damage charges (Terms §5), in two phases:
//   1. Card on file: saved at booking (Checkout with setup_future_usage), or
//      later through a save-card link (Checkout in setup mode = SetupIntent).
//   2. Damage claim: the guest is emailed the description + photos, then after
//      DAMAGE_NOTICE_HOURS the host charges the saved card off-session. If the
//      card can't be charged (declined, needs bank verification, none on file),
//      the guest is emailed a secure payment link instead.
import type Stripe from "stripe";
import type { Booking, DamageClaim, Property } from "@prisma/client";
import { addHours, format, startOfDay } from "date-fns";
import { prisma } from "./prisma";
import { createCheckoutSessionBlockingPrepaid, stripe } from "./stripe";
import { SITE } from "./config";
import { manageBookingPath } from "./booking";
import { sendGuestEmail, sendOwnerAlert } from "./email";
import { formatCents } from "./format";
import { DAMAGE_MAX_CENTS, DAMAGE_NOTICE_HOURS } from "./policy";
import { cardFailureReason, hasCardOnFile, resolveSavedCard } from "./cards";
import { captureFromDeposit, placeDepositIfDue } from "./deposits";

export class DamageError extends Error {}

type BookingWithProperty = Booking & { property: Property };

const OPEN_STATUSES = ["NOTICE_SENT", "CHARGING", "CHARGED", "PAYMENT_LINK_SENT", "PAID"] as const;

/** A claim can be filed once the guest has stayed and checked out. */
export function damageEligibility(b: Booking, now = new Date()): string | null {
  const today = startOfDay(now);
  if (b.status === "CONFIRMED" || b.status === "COMPLETED") {
    return startOfDay(b.checkOut) <= today ? null : "Damage claims can be filed after check-out.";
  }
  if (b.status === "CANCELLED" && b.cancelledAt && startOfDay(b.cancelledAt) > startOfDay(b.checkIn)) {
    return null; // cancelled mid-stay: the guest did stay
  }
  return "Damage claims are only available for stays that took place.";
}

/** Cents still available under the per-booking cap. */
export async function damageCapRemaining(bookingId: string) {
  const agg = await prisma.damageClaim.aggregate({
    where: { bookingId, status: { in: [...OPEN_STATUSES] } },
    _sum: { amount: true }
  });
  return Math.max(0, DAMAGE_MAX_CENTS - (agg._sum.amount ?? 0));
}

const manageUrl = (b: BookingWithProperty) => `${SITE.url}${manageBookingPath(b, b.property.slug)}`;
const payUrl = (claim: DamageClaim, b: Booking) => `${SITE.url}/api/damage-claims/${claim.id}/pay?t=${b.messageToken ?? ""}`;
const stayLabel = (b: BookingWithProperty) =>
  `${b.property.name} (${format(b.checkIn, "MMM d")} – ${format(b.checkOut, "MMM d, yyyy")})`;

export { hasCardOnFile };

// ── Phase 2a: file a claim and notify the guest ─────────────────────────────

export async function createDamageClaim(input: {
  bookingId: string;
  amountCents: number;
  description: string;
  photoUrls: string[];
}) {
  const b = await prisma.booking.findUnique({ where: { id: input.bookingId }, include: { property: true } });
  if (!b) throw new DamageError("Booking not found");
  const notEligible = damageEligibility(b);
  if (notEligible) throw new DamageError(notEligible);
  if (!Number.isInteger(input.amountCents) || input.amountCents < 100) throw new DamageError("Amount must be at least $1.");
  const description = input.description.trim();
  if (description.length < 10) throw new DamageError("Describe the damage (at least a sentence).");
  const photos = input.photoUrls.map((u) => u.trim()).filter(Boolean);
  if (photos.length === 0) throw new DamageError("Add at least one photo — the Terms require photos with the notice.");
  for (const p of photos) {
    if (!/^https:\/\/\S+$/i.test(p)) throw new DamageError(`Photo links must be full https:// URLs: ${p}`);
  }
  const remaining = await damageCapRemaining(b.id);
  if (input.amountCents > remaining) {
    throw new DamageError(
      `This would exceed the ${formatCents(DAMAGE_MAX_CENTS)} limit in the Terms. Up to ${formatCents(remaining)} can still be claimed for this stay.`
    );
  }

  const chargeAfter = addHours(new Date(), DAMAGE_NOTICE_HOURS);
  const claim = await prisma.damageClaim.create({
    data: {
      bookingId: b.id,
      amount: input.amountCents,
      description,
      photoUrls: JSON.stringify(photos),
      chargeAfter
    }
  });

  const when = `on or after ${format(chargeAfter, "MMM d, yyyy 'at' h:mm a")} (UTC)`;
  const cardLine =
    b.depositStatus === "HELD"
      ? claim.amount > (b.depositAmount ?? 0)
        ? `Under Section 5 of our Terms, ${formatCents(b.depositAmount ?? 0)} will be taken from your security hold ${when}, ` +
          `and the remaining ${formatCents(claim.amount - (b.depositAmount ?? 0))} charged to the card you used for this booking.`
        : `Under Section 5 of our Terms, ${formatCents(claim.amount)} will be taken from your security hold ${when}.`
      : hasCardOnFile(b)
        ? `Under Section 5 of our Terms, ${formatCents(claim.amount)} will be charged to the card you used for this booking ${when}.`
        : `You'll receive a secure link to pay ${formatCents(claim.amount)} ${when}.`;
  await sendGuestEmail(
    b.guestEmail,
    `Damage report for your stay at ${b.property.name}`,
    `Hi ${b.guestName},\n\nAfter your stay at ${stayLabel(b)}, we found damage beyond normal wear and tear:\n\n` +
      `${description}\n\nPhotos:\n${photos.map((p) => `  • ${p}`).join("\n")}\n\nAmount: ${formatCents(claim.amount)}\n\n` +
      `${cardLine}\n\nIf you have questions or want to discuss this before then, reply through your booking page:\n${manageUrl(b)}`
  );
  return claim;
}

// ── Phase 2b: charge the saved card ─────────────────────────────────────────

export type ChargeResult =
  | { outcome: "CHARGED"; claim: DamageClaim }
  | { outcome: "PAYMENT_LINK_SENT"; claim: DamageClaim; reason: string };

export async function chargeDamageClaim(claimId: string, now = new Date()): Promise<ChargeResult> {
  // Lock: only one charge attempt per claim, and only after the notice period.
  const locked = await prisma.damageClaim.updateMany({
    where: { id: claimId, status: "NOTICE_SENT", chargeAfter: { lte: now } },
    data: { status: "CHARGING" }
  });
  if (locked.count !== 1) {
    const c = await prisma.damageClaim.findUnique({ where: { id: claimId } });
    if (!c) throw new DamageError("Claim not found");
    if (c.status === "NOTICE_SENT") {
      throw new DamageError(`The ${DAMAGE_NOTICE_HOURS}-hour notice period ends ${format(c.chargeAfter, "MMM d 'at' h:mm a")} (UTC).`);
    }
    throw new DamageError(`This claim is already ${c.status.toLowerCase().replace(/_/g, " ")}.`);
  }

  const claim = await prisma.damageClaim.findUniqueOrThrow({ where: { id: claimId }, include: { booking: { include: { property: true } } } });
  const b = claim.booking;
  const unlock = async (reason: string) => {
    await prisma.damageClaim.update({ where: { id: claim.id }, data: { status: "NOTICE_SENT", failureReason: reason } });
  };

  if (!stripe) {
    await unlock("Stripe isn't configured.");
    throw new DamageError("Stripe isn't configured, so the charge can't be made online. Collect it another way or connect Stripe first.");
  }
  const s = stripe;

  // 1. Take what we can from the security hold. Saved immediately, so a retry
  //    after an error never takes it twice.
  let fromDeposit = claim.fromDepositAmount;
  if (fromDeposit === 0) {
    try {
      const cap = await captureFromDeposit(b.id, claim.amount);
      if (cap.captured > 0) {
        fromDeposit = cap.captured;
        await prisma.damageClaim.update({
          where: { id: claim.id },
          data: { fromDepositAmount: fromDeposit, stripePaymentIntentId: cap.paymentIntentId }
        });
      }
    } catch (err) {
      await unlock(`Stripe error: ${(err as Error).message}`);
      throw new DamageError("Stripe didn't respond as expected. Nothing was charged — try again in a few minutes.");
    }
  }
  const remainder = claim.amount - fromDeposit;
  const depositLine = fromDeposit > 0 ? `${formatCents(fromDeposit)} was taken from your security hold. ` : "";

  if (remainder === 0) {
    const charged = await prisma.damageClaim.update({
      where: { id: claim.id },
      data: { status: "CHARGED", chargedAt: new Date(), failureReason: null }
    });
    await sendGuestEmail(
      b.guestEmail,
      `Damage charge for your stay at ${b.property.name}`,
      `Hi ${b.guestName},\n\nAs described in our notice, ${formatCents(claim.amount)} was taken from your security hold for:\n\n${claim.description}\n\n` +
        `Any remaining hold has been released.\n\nQuestions? Reply through your booking page:\n${manageUrl(b)}`
    );
    return { outcome: "CHARGED", claim: charged };
  }

  // 2. Charge the rest to the saved card.
  let failure = "No card is on file for this booking.";
  try {
    const card = await resolveSavedCard(b);
    if (card) {
      try {
        const pi = await s.paymentIntents.create(
          {
            amount: remainder,
            currency: "usd",
            customer: card.customer,
            payment_method: card.paymentMethod,
            off_session: true,
            confirm: true,
            description: `Damage charge — ${b.property.name}`,
            receipt_email: b.guestEmail,
            metadata: { kind: "damage", damageClaimId: claim.id, bookingId: b.id }
          },
          { idempotencyKey: `damage-${claim.id}-${card.paymentMethod}-${remainder}` }
        );
        if (pi.status === "succeeded") {
          const charged = await prisma.damageClaim.update({
            where: { id: claim.id },
            data: { status: "CHARGED", stripePaymentIntentId: pi.id, chargedAt: new Date(), failureReason: null }
          });
          await sendGuestEmail(
            b.guestEmail,
            `Damage charge for your stay at ${b.property.name}`,
            `Hi ${b.guestName},\n\nAs described in our notice, ${formatCents(claim.amount)} has been collected for:\n\n${claim.description}\n\n` +
              `${depositLine}${formatCents(remainder)} was charged to your card on file.\n\nQuestions? Reply through your booking page:\n${manageUrl(b)}`
          );
          return { outcome: "CHARGED", claim: charged };
        }
        failure = `Card charge returned status "${pi.status}".`;
        await s.paymentIntents.cancel(pi.id).catch(() => {});
      } catch (err) {
        const reason = cardFailureReason(err);
        if (!reason) throw err;
        failure = reason;
      }
    }
  } catch (err) {
    await unlock(`Stripe error: ${(err as Error).message}`);
    throw new DamageError(
      fromDeposit > 0
        ? `${formatCents(fromDeposit)} was taken from the security hold, but Stripe didn't respond for the remaining ${formatCents(remainder)}. Try again in a few minutes.`
        : "Stripe didn't respond as expected. Nothing was charged — try again in a few minutes."
    );
  }

  // 3. Fall back to a payment link for the rest.
  const linked = await prisma.damageClaim.update({ where: { id: claim.id }, data: { status: "PAYMENT_LINK_SENT", failureReason: failure } });
  await sendGuestEmail(
    b.guestEmail,
    `Payment needed: damage charge for ${b.property.name}`,
    `Hi ${b.guestName},\n\nFor the damage we notified you about (${formatCents(claim.amount)}):\n\n${claim.description}\n\n` +
      `${depositLine}We couldn't charge your card on file for the remaining ${formatCents(remainder)}. Please pay securely here:\n${payUrl(linked, b)}\n\n` +
      `Questions? Reply through your booking page:\n${manageUrl(b)}`
  );
  await sendOwnerAlert(
    "Damage charge needs the guest",
    `${fromDeposit > 0 ? `Took ${formatCents(fromDeposit)} from the security hold. ` : ""}Couldn't charge ${b.guestName}'s card ` +
      `for ${formatCents(remainder)} at ${b.property.name}: ${failure}\nThe guest was emailed a payment link.`
  );
  return { outcome: "PAYMENT_LINK_SENT", claim: linked, reason: failure };
}

export async function cancelDamageClaim(claimId: string) {
  const res = await prisma.damageClaim.updateMany({
    where: { id: claimId, status: { in: ["NOTICE_SENT", "PAYMENT_LINK_SENT"] } },
    data: { status: "CANCELLED" }
  });
  if (res.count !== 1) throw new DamageError("Only claims that haven't been paid can be withdrawn.");
  const c = await prisma.damageClaim.findUniqueOrThrow({ where: { id: claimId }, include: { booking: { include: { property: true } } } });
  await sendGuestEmail(
    c.booking.guestEmail,
    `Damage claim withdrawn — ${c.booking.property.name}`,
    `Hi ${c.booking.guestName},\n\nWe've withdrawn the damage claim of ${formatCents(c.amount)} for your stay at ${stayLabel(c.booking)}. Nothing will be charged.`
  );
}

// ── Guest payment link (Checkout, payment mode) ─────────────────────────────

/** Creates a fresh Checkout session for an unpaid claim. Returns its URL. */
export async function createDamagePaymentSession(claim: DamageClaim, b: BookingWithProperty) {
  if (!stripe) throw new DamageError("Online payment isn't available.");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(b.stripeCustomerId ? { customer: b.stripeCustomerId } : { customer_email: b.guestEmail }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: claim.amount - claim.fromDepositAmount,
          product_data: { name: `Damage charge — ${b.property.name}`, description: claim.description.slice(0, 500) }
        }
      }
    ],
    payment_intent_data: { metadata: { kind: "damage", damageClaimId: claim.id, bookingId: b.id } },
    metadata: { kind: "damage", damageClaimId: claim.id },
    success_url: manageUrl(b),
    cancel_url: manageUrl(b)
  });
  return session.url!;
}

export async function handleDamageCheckoutCompleted(session: Stripe.Checkout.Session) {
  const claimId = session.metadata?.damageClaimId;
  if (!claimId || session.payment_status !== "paid" || !stripe) return;
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!piId) return;
  const claim = await prisma.damageClaim.findUnique({ where: { id: claimId }, include: { booking: { include: { property: true } } } });
  if (!claim || claim.stripePaymentIntentId === piId) return; // unknown or webhook retry

  const paid = await prisma.damageClaim.updateMany({
    where: { id: claimId, status: "PAYMENT_LINK_SENT" },
    data: { status: "PAID", stripePaymentIntentId: piId, chargedAt: new Date(), failureReason: null }
  });
  if (paid.count !== 1) {
    // Already paid (e.g. two tabs) or withdrawn — never keep a second payment.
    await stripe.refunds.create({ payment_intent: piId }, { idempotencyKey: `damage-dup-refund-${piId}` });
    await sendOwnerAlert(
      "Duplicate damage payment refunded",
      `A payment of ${formatCents(session.amount_total ?? 0)} for damage claim ${claimId} arrived after the claim was ${claim.status.toLowerCase()}. It was refunded automatically.`
    );
    return;
  }
  await sendOwnerAlert(
    "Damage charge paid",
    `${claim.booking.guestName} paid ${formatCents(session.amount_total ?? claim.amount - claim.fromDepositAmount)} for damage at ${claim.booking.property.name}` +
      (claim.fromDepositAmount > 0 ? ` (plus ${formatCents(claim.fromDepositAmount)} taken from the security hold).` : ".")
  );
}

// ── Phase 1 (for bookings without a card): save-card link (SetupIntent) ─────

/** Emails the guest a link to save a card (or replace one that stopped working). */
export async function requestCardOnFile(bookingId: string) {
  if (!stripe) throw new DamageError("Connect Stripe first.");
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { property: true } });
  if (!b) throw new DamageError("Booking not found");
  await prisma.booking.update({ where: { id: b.id }, data: { cardRequestedAt: new Date() } });
  await sendGuestEmail(
    b.guestEmail,
    `Please add a card for your stay at ${b.property.name}`,
    `Hi ${b.guestName},\n\nPlease save a card for your stay at ${stayLabel(b)}. Nothing is charged now. ` +
      `Under Section 5 of our Terms it's only used for documented damages, and you'd be notified with photos first.\n\n` +
      `Save your card securely here:\n${SITE.url}/api/bookings/${b.id}/save-card?t=${b.messageToken ?? ""}`
  );
}

/** Creates a Checkout session in setup mode (a SetupIntent) to save the guest's card. */
export async function createCardSetupSession(b: BookingWithProperty) {
  if (!stripe) throw new DamageError("Online payment isn't available.");
  let customer = b.stripeCustomerId;
  if (!customer) {
    const c = await stripe.customers.create(
      { email: b.guestEmail, name: b.guestName, phone: b.guestPhone ?? undefined, metadata: { bookingId: b.id } },
      { idempotencyKey: `customer-${b.id}` }
    );
    customer = c.id;
    await prisma.booking.update({ where: { id: b.id }, data: { stripeCustomerId: customer } });
  }
  const session = await createCheckoutSessionBlockingPrepaid({
    mode: "setup",
    customer,
    payment_method_types: ["card"],
    setup_intent_data: { metadata: { kind: "card_setup", bookingId: b.id } },
    metadata: { kind: "card_setup", bookingId: b.id },
    success_url: manageUrl(b),
    cancel_url: manageUrl(b)
  });
  return session.url!;
}

export async function handleCardSetupCompleted(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId || !stripe || session.mode !== "setup") return;
  const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  if (!setupIntentId) return;
  const si = await stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethod = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (si.status !== "succeeded" || !paymentMethod || !customer) return;
  const b = await prisma.booking.update({
    where: { id: bookingId },
    data: { stripeCustomerId: customer, stripePaymentMethodId: paymentMethod },
    include: { property: true }
  });
  // Long stays: future monthly payments use the new card too.
  if (b.stripeSubscriptionId) {
    await stripe.subscriptions.update(b.stripeSubscriptionId, { default_payment_method: paymentMethod }).catch((err) =>
      console.error("[card] couldn't update subscription card", err)
    );
  }
  await sendOwnerAlert("Card saved", `${b.guestName} saved a card for their stay at ${stayLabel(b)}.`);
  // A security hold that failed or is due can be placed right away.
  await placeDepositIfDue(b.id);
}
