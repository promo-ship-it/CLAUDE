// Everything that moves money: Stripe Checkout, monthly billing for long
// stays, webhook handling, and cancellations/refunds.
import type Stripe from "stripe";
import type { Booking, Payment, Property } from "@prisma/client";
import { addDays, format, startOfDay } from "date-fns";
import { prisma } from "./prisma";
import { stripe } from "./stripe";
import { SITE } from "./config";
import { manageBookingPath } from "./booking";
import { notifyBooking } from "./notify";
import { sendCancellationEmails, sendOwnerAlert } from "./email";
import { computeCancellation, type CancellationResult } from "./cancellation";
import { formatCents } from "./format";
import { POLICY_NAMES, type RatePlan } from "./policy";
import type { Quote } from "./quote";

const CHECKOUT_EXPIRES_MINUTES = 31; // Stripe minimum is 30; dates are held for 35

function requireStripe(): Stripe {
  if (!stripe) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY is missing).");
  return stripe;
}

/** Amount of the next monthly charge after `paymentsMade` payments, or null when billing is done. */
export function nextInstallmentAmount(
  b: Pick<Booking, "totalPayments" | "monthlyAmount" | "proratedFinal">,
  paymentsMade: number
): number | null {
  const total = b.totalPayments ?? 0;
  const remaining = total - paymentsMade;
  if (remaining <= 0 || !b.monthlyAmount) return null;
  if (remaining === 1 && b.proratedFinal) return b.proratedFinal;
  return b.monthlyAmount;
}

// ── Checkout ────────────────────────────────────────────────────────────────

export async function createCheckoutSession(booking: Booking, property: Property, quote: Quote) {
  const s = requireStripe();
  const manage = `${SITE.url}${manageBookingPath(booking, property.slug)}`;
  const nightsLabel = `${quote.nights} night${quote.nights > 1 ? "s" : ""}`;
  const dates = `${format(booking.checkIn, "MMM d")} – ${format(booking.checkOut, "MMM d, yyyy")}`;

  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  // The card is saved to a Stripe customer for every booking: long stays need
  // it for the monthly payments, and the Terms let the host charge documented
  // damages after check-out (done from the Stripe dashboard).
  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: { bookingId: booking.id },
    setup_future_usage: "off_session"
  };

  if (booking.paymentType === "STRIPE_RECURRING" && quote.monthly) {
    const m = quote.monthly;
    const cleaningCharge = m.firstCharge - m.monthCharge;
    lineItems = [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: m.monthCharge,
          product_data: {
            name: `${property.name} — payment 1 of ${m.totalPayments} (first 30 nights, incl. tax)`,
            description: `${dates} · ${nightsLabel} · ${quote.discountLabel ?? ""}`.trim()
          }
        }
      }
    ];
    if (cleaningCharge > 0) {
      lineItems.push({
        quantity: 1,
        price_data: { currency: "usd", unit_amount: cleaningCharge, product_data: { name: "Cleaning fee (incl. tax)" } }
      });
    }
  } else {
    lineItems = [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: quote.total,
          product_data: {
            name: `${property.name} — ${nightsLabel} (${POLICY_NAMES[quote.plan]} rate)`,
            description: `${dates}. Includes cleaning fee and taxes.`
          }
        }
      }
    ];
  }

  const session = await s.checkout.sessions.create({
    mode: "payment",
    customer_email: booking.guestEmail,
    customer_creation: "always",
    line_items: lineItems,
    payment_intent_data: paymentIntentData,
    metadata: { bookingId: booking.id },
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_MINUTES * 60,
    success_url: manage,
    cancel_url: `${SITE.url}/properties/${property.slug}`
  });

  await prisma.booking.update({ where: { id: booking.id }, data: { stripeSessionId: session.id } });
  return session;
}

// ── Webhook handlers ────────────────────────────────────────────────────────

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Checkout is also used for damage payments and saving a card (damages.ts).
  const kind = session.metadata?.kind;
  if (kind === "damage") return (await import("./damages")).handleDamageCheckoutCompleted(session);
  if (kind === "card_setup") return (await import("./damages")).handleCardSetupCompleted(session);

  const bookingId = session.metadata?.bookingId;
  if (!bookingId || session.payment_status !== "paid") return;
  const s = requireStripe();

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { property: true } });
  if (!booking) return;
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!piId) return;

  // Webhook retries: already processed.
  if (booking.stripePaymentIntentId === piId && booking.status !== "PENDING") return;

  await prisma.payment.upsert({
    where: { stripeRef: piId },
    create: { bookingId, stripeRef: piId, stripePaymentIntentId: piId, kind: "ONE_TIME", amount: session.amount_total ?? 0 },
    update: {}
  });

  // Paid after the booking was already cancelled (e.g. checkout completed
  // right as the hold expired). Refund automatically — dates may be gone.
  if (booking.status === "CANCELLED") {
    await s.refunds.create({ payment_intent: piId }, { idempotencyKey: `late-refund-${bookingId}` });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { stripePaymentIntentId: piId, refundAmount: session.amount_total ?? 0, cancellationNote: "Payment arrived after the booking was cancelled — refunded automatically." }
    });
    await sendOwnerAlert("Late payment refunded", `Booking ${bookingId} was paid after it was cancelled. The payment was refunded in full.`);
    return;
  }

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  let subscriptionId: string | null = booking.stripeSubscriptionId;
  if (booking.paymentType === "STRIPE_RECURRING" && (booking.totalPayments ?? 1) > 1 && !subscriptionId) {
    if (customerId) subscriptionId = await startMonthlyBilling(booking, booking.property, customerId, piId);
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CONFIRMED",
      stripePaymentIntentId: piId,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: booking.stripeCustomerId ?? customerId
    },
    include: { property: true }
  });
  await notifyBooking(updated, updated.property, "CONFIRMED");
}

/**
 * Starts automatic billing for payments 2..N of a long stay. Payment 1 was
 * collected at checkout. No charge until 30 days after check-in, then monthly.
 */
async function startMonthlyBilling(booking: Booking, property: Property, customerId: string, piId: string) {
  const s = requireStripe();
  const pi = await s.paymentIntents.retrieve(piId);
  const paymentMethod = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
  const amount = nextInstallmentAmount(booking, 1);
  if (!amount || !paymentMethod) return null;

  const product = await s.products.create(
    { name: `${property.name} — monthly stay`, metadata: { bookingId: booking.id } },
    { idempotencyKey: `product-${booking.id}` }
  );
  // 30 days after check-in, mid-day UTC.
  const firstBill = new Date(addDays(startOfDay(booking.checkIn), 30).getTime() + 15 * 3600 * 1000);
  const sub = await s.subscriptions.create(
    {
      customer: customerId,
      default_payment_method: paymentMethod,
      items: [{ price_data: { currency: "usd", product: product.id, unit_amount: amount, recurring: { interval: "month" } } }],
      trial_end: Math.floor(firstBill.getTime() / 1000),
      proration_behavior: "none",
      description: `${property.name}: ${format(booking.checkIn, "MMM d")} – ${format(booking.checkOut, "MMM d, yyyy")}`,
      metadata: { bookingId: booking.id }
    },
    { idempotencyKey: `sub-${booking.id}` }
  );
  return sub.id;
}

/** Records a monthly payment and keeps the subscription on the agreed schedule. */
export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId || invoice.amount_paid <= 0) return; // trial / $0 invoices
  const s = requireStripe();

  let booking = await prisma.booking.findFirst({ where: { stripeSubscriptionId: subId } });
  if (!booking) {
    const sub = await s.subscriptions.retrieve(subId);
    const id = sub.metadata?.bookingId;
    if (id) booking = await prisma.booking.findUnique({ where: { id } });
  }
  if (!booking) return;

  const existing = await prisma.payment.findUnique({ where: { stripeRef: invoice.id } });
  if (existing) return; // webhook retry

  const piId = typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id ?? null;
  await prisma.payment.create({
    data: { bookingId: booking.id, stripeRef: invoice.id, stripePaymentIntentId: piId, kind: "INSTALLMENT", amount: invoice.amount_paid }
  });

  const made = await prisma.payment.count({ where: { bookingId: booking.id, kind: { in: ["ONE_TIME", "INSTALLMENT"] } } });
  const next = nextInstallmentAmount(booking, made);
  if (next === null) {
    await s.subscriptions.update(subId, { cancel_at_period_end: true });
    return;
  }
  const sub = await s.subscriptions.retrieve(subId);
  const item = sub.items.data[0];
  if (item && item.price.unit_amount !== next) {
    const productId = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
    await s.subscriptions.update(subId, {
      proration_behavior: "none",
      items: [{ id: item.id, price_data: { currency: "usd", product: productId, unit_amount: next, recurring: { interval: "month" } } }]
    });
  }
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;
  const booking = await prisma.booking.findFirst({ where: { stripeSubscriptionId: subId }, include: { property: true } });
  if (!booking) return;
  await sendOwnerAlert(
    "Monthly payment failed",
    `A monthly payment of ${formatCents(invoice.amount_due)} failed for ${booking.guestName} (${booking.guestEmail}, ${booking.guestPhone ?? "no phone"}) ` +
      `at ${booking.property.name}. Stripe will retry automatically. Consider contacting the guest.`
  );
}

export async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const booking = await prisma.booking.findFirst({ where: { stripeSubscriptionId: sub.id }, include: { property: true } });
  if (!booking || booking.status !== "CONFIRMED") return;
  if (booking.checkOut <= new Date()) {
    await prisma.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED" } });
    return;
  }
  const made = await prisma.payment.count({ where: { bookingId: booking.id, kind: { in: ["ONE_TIME", "INSTALLMENT"] } } });
  if (made < (booking.totalPayments ?? 0)) {
    await sendOwnerAlert(
      "Monthly billing stopped early",
      `Billing for ${booking.guestName} at ${booking.property.name} ended after ${made} of ${booking.totalPayments} payments ` +
        `(cancelled in Stripe, or repeated payment failures). The booking is still marked confirmed — please follow up.`
    );
  }
}

export async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind) return; // expired damage-payment / save-card sessions need no action
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return;
  await prisma.booking.updateMany({
    where: { id: bookingId, status: "PENDING" },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "GUEST", refundAmount: 0, cancellationNote: "Checkout was not completed." }
  });
}

// ── Cancellation ────────────────────────────────────────────────────────────

type BookingWithMoney = Booking & { property: Property; payments: Payment[] };

function amountPaid(b: BookingWithMoney) {
  return b.payments.reduce((sum, p) => sum + p.amount - p.refundedAmount, 0);
}

export function previewCancellation(b: BookingWithMoney, hostInitiated: boolean, now = new Date()): CancellationResult {
  return computeCancellation({
    policy: b.cancellationPolicy as RatePlan,
    status: b.status,
    bookedAt: b.createdAt,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: b.nights,
    subtotal: b.subtotal,
    cleaningFee: b.cleaningFee,
    taxRate: b.property.taxRate,
    total: b.total,
    amountPaid: amountPaid(b),
    hostInitiated,
    now
  });
}

export class CancellationError extends Error {}

/**
 * Cancels a booking and moves the money: stops monthly billing, refunds per
 * the policy (or in full if the host cancels), and for long stays charges any
 * notice-period shortfall to the saved card. Idempotency keys make retries and
 * double-clicks safe.
 */
export async function cancelBooking(bookingId: string, actor: "GUEST" | "HOST", hostFullRefund: boolean) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { property: true, payments: true } });
  if (!b) throw new CancellationError("Booking not found");

  const result = previewCancellation(b, actor === "HOST" && hostFullRefund);
  if (!result.allowed) throw new CancellationError(result.reason || "This booking can't be cancelled.");

  const notes: string[] = [];
  const paid = amountPaid(b);
  let refunded = 0;
  if (paid > 0 || b.stripeSubscriptionId || b.stripeSessionId) {
    if (!stripe) {
      if (paid > 0) throw new CancellationError("Stripe isn't configured, so refunds can't be issued automatically.");
    } else {
      const s = stripe;
      // 1. Unpaid checkout still open → close it.
      if (b.status === "PENDING" && b.stripeSessionId && paid === 0) {
        await s.checkout.sessions.expire(b.stripeSessionId).catch(() => {});
      }

      // 2. Stop monthly billing (keep customer + card for a possible shortfall charge).
      let customerId: string | null = null;
      let paymentMethod: string | null = null;
      if (b.stripeSubscriptionId) {
        const sub = await s.subscriptions.retrieve(b.stripeSubscriptionId).catch(() => null);
        if (sub) {
          customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          paymentMethod = typeof sub.default_payment_method === "string" ? sub.default_payment_method : sub.default_payment_method?.id ?? null;
          if (sub.status !== "canceled") await s.subscriptions.cancel(sub.id);
        }
      }

      // 3. Refund, newest payment first.
      let remaining = result.refund;
      const newestFirst = [...b.payments].sort((x, y) => y.paidAt.getTime() - x.paidAt.getTime());
      for (const p of newestFirst) {
        if (remaining <= 0) break;
        const refundable = p.amount - p.refundedAmount;
        const amt = Math.min(remaining, refundable);
        if (amt <= 0 || !p.stripePaymentIntentId) continue;
        await s.refunds.create(
          { payment_intent: p.stripePaymentIntentId, amount: amt, metadata: { bookingId: b.id } },
          { idempotencyKey: `refund-${b.id}-${p.id}-${p.refundedAmount}-${amt}` }
        );
        await prisma.payment.update({ where: { id: p.id }, data: { refundedAmount: { increment: amt } } });
        remaining -= amt;
        refunded += amt;
      }
      if (remaining > 0) notes.push(`${formatCents(remaining)} could not be refunded automatically — refund it in the Stripe dashboard.`);

      // 4. Long stays: charge the notice-period shortfall to the saved card.
      if (result.shortfall > 0) {
        if (customerId && paymentMethod) {
          try {
            const pi = await s.paymentIntents.create(
              {
                amount: result.shortfall,
                currency: "usd",
                customer: customerId,
                payment_method: paymentMethod,
                off_session: true,
                confirm: true,
                description: `${b.property.name}: cancellation notice period`,
                metadata: { bookingId: b.id }
              },
              { idempotencyKey: `shortfall-${b.id}` }
            );
            await prisma.payment.create({
              data: { bookingId: b.id, stripeRef: pi.id, stripePaymentIntentId: pi.id, kind: "SHORTFALL", amount: result.shortfall }
            });
          } catch {
            notes.push(`The notice-period balance of ${formatCents(result.shortfall)} could not be charged automatically — collect it manually.`);
          }
        } else {
          notes.push(`A notice-period balance of ${formatCents(result.shortfall)} is owed — collect it manually.`);
        }
      }
    }
  }

  const note = notes.join(" ") || null;
  await prisma.booking.update({
    where: { id: b.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy: actor,
      refundAmount: refunded,
      cancellationNote: [result.explanation, note].filter(Boolean).join(" ")
    }
  });

  await sendCancellationEmails({
    guestEmail: b.guestEmail,
    guestName: b.guestName,
    propertyName: b.property.name,
    checkIn: format(b.checkIn, "MMM d, yyyy"),
    checkOut: format(b.checkOut, "MMM d, yyyy"),
    refund: formatCents(refunded),
    explanation: result.explanation + (result.shortfall > 0 ? ` A notice-period balance of ${formatCents(result.shortfall)} applies.` : ""),
    cancelledBy: actor,
    note
  });

  return { ...result, refunded, note };
}
