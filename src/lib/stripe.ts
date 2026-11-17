import Stripe from "stripe";
import { BLOCK_PREPAID_CARDS } from "./policy";

export const stripeEnabled = Boolean(process.env.STRIPE_SECRET_KEY);

// All API calls use this pinned version, so response shapes match the code.
// Webhook payloads use the webhook endpoint's own version; handlers that
// depend on version-specific fields re-fetch the object (see payments.ts).
export const stripe = stripeEnabled
  ? new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-06-20" })
  : null;

// Checkout's `funding_types_blocked` (reject prepaid cards) needs this API
// version. It's sent only on the Checkout-create requests that use it.
const CARD_RESTRICTIONS_API_VERSION = "2026-08-26.dahlia";

/**
 * Creates a Checkout Session that rejects prepaid cards (BLOCK_PREPAID_CARDS).
 * If Stripe ever refuses the restriction parameter, the session is created
 * without it rather than blocking the booking, and the error is logged.
 */
export async function createCheckoutSessionBlockingPrepaid(
  params: Stripe.Checkout.SessionCreateParams
): Promise<Stripe.Checkout.Session> {
  if (!stripe) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY is missing).");
  if (!BLOCK_PREPAID_CARDS) return stripe.checkout.sessions.create(params);

  const withBlock = {
    ...params,
    payment_method_options: {
      ...(params.payment_method_options ?? {}),
      card: {
        ...(params.payment_method_options?.card ?? {}),
        restrictions: { funding_types_blocked: ["prepaid"] }
      }
    }
  } as Stripe.Checkout.SessionCreateParams;

  try {
    return await stripe.checkout.sessions.create(withBlock, { apiVersion: CARD_RESTRICTIONS_API_VERSION });
  } catch (err) {
    const e = err as { type?: string; message?: string; param?: string };
    const aboutRestriction = /restriction|funding_types_blocked/i.test(`${e.param ?? ""} ${e.message ?? ""}`);
    if (e.type === "StripeInvalidRequestError" && aboutRestriction) {
      console.error("[stripe] prepaid-card block rejected by Stripe; creating session without it:", e.message);
      return stripe.checkout.sessions.create(params);
    }
    throw err;
  }
}
