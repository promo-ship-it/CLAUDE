import type { Booking } from "@prisma/client";
import { prisma } from "./prisma";
import { stripe } from "./stripe";

/**
 * The card saved for a booking: set by the save-card flow, or read once from
 * the booking's first payment and cached on the booking.
 */
export async function resolveSavedCard(b: Booking): Promise<{ customer: string; paymentMethod: string } | null> {
  if (!stripe) return null;
  if (b.stripeCustomerId && b.stripePaymentMethodId) return { customer: b.stripeCustomerId, paymentMethod: b.stripePaymentMethodId };
  if (!b.stripePaymentIntentId) return null;
  const pi = await stripe.paymentIntents.retrieve(b.stripePaymentIntentId);
  const customer = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
  const paymentMethod = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
  if (!customer || !paymentMethod) return null;
  await prisma.booking.update({ where: { id: b.id }, data: { stripeCustomerId: customer, stripePaymentMethodId: paymentMethod } });
  return { customer, paymentMethod };
}

export function hasCardOnFile(b: Booking) {
  return Boolean(b.stripePaymentMethodId || b.stripePaymentIntentId);
}

/** Card-error check shared by every off-session charge/authorization. */
export function cardFailureReason(err: unknown): string | null {
  const e = err as { type?: string; code?: string; decline_code?: string; message?: string };
  if (e?.type !== "StripeCardError" && e?.type !== "StripeInvalidRequestError") return null;
  if (e.code === "authentication_required") return "The guest's bank requires them to approve the charge.";
  if (e.decline_code === "insufficient_funds") return "The card has insufficient funds.";
  return `The card was declined${e.message ? `: ${e.message}` : "."}`;
}
