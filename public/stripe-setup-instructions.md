# Stripe Payment Setup Instructions

Connecting Stripe turns on online payments, the 10% non-refundable rate, and
automatic monthly billing for stays of 30+ nights. Until Stripe is connected
the site runs in "Request to Book" mode (no money collected online).

---

## Step 1: Create a Stripe account

1. Go to https://dashboard.stripe.com/register and create an account.
2. Stay in **Test mode** (toggle in the top-right) until everything works.
3. Before going live, complete Stripe's business verification.

## Step 2: Copy your API keys

1. In Stripe, open **Developers → API keys**.
2. Copy the **Publishable key** (`pk_test_…`) and the **Secret key** (`sk_test_…`).

## Step 3: Create the webhook

1. In Stripe, open **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://YOUR-DOMAIN/api/webhooks/stripe`
3. Select these 5 events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
4. Save, then click **Reveal** next to *Signing secret* and copy it (`whsec_…`).

The signing secret is **required**. The site rejects any webhook that isn't signed.

## Step 4: Add the keys to your host

In Vercel: **Project → Settings → Environment Variables** (Production and Preview):

| Key | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` (later `sk_live_…`) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (later `pk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |

## Step 5: Redeploy and test

1. Redeploy the site.
2. Open `/admin/stripe-setup` — status should say **Stripe connected**.
3. Book a property with test card `4242 4242 4242 4242` (any future date, any CVC).
4. You land on the guest's booking page; within seconds it shows **Booking confirmed**.
5. Check `/admin/bookings`: the booking shows **CONFIRMED** and **paid $…**.
6. Test a cancellation from the guest's booking page — Stripe shows the refund.
7. Test a 30+ night stay — Stripe shows a subscription that starts billing 30 days after check-in.

## Going live

1. In Stripe, switch off Test mode.
2. Copy the **live** keys and create the webhook again in live mode (live webhooks are separate).
3. Replace the three environment variables with the live values and redeploy.

## How money moves (for reference)

- **Under 30 nights:** the full total is charged at checkout.
- **30+ nights:** payment 1 (first 30 nights + cleaning fee) at checkout; then a
  subscription charges each remaining payment, starting 30 days after check-in.
  The last payment is prorated, and billing stops automatically after it.
- **Cancellations:** the guest (from their booking link) or you (from
  `/admin/bookings`) cancel on the site; the refund is calculated by the policy
  and issued through Stripe automatically. Long-stay notice balances are charged
  to the saved card.
- **Unfinished checkouts** release the dates after about 35 minutes.
- **Damage charges:** every card is saved to a Stripe customer at checkout. After
  a stay, file the claim from `/admin/bookings` → **Report damage**. The guest is
  emailed the description and photos; after 48 hours you charge the saved card
  off-session. If the charge fails, the guest is emailed a payment link. Bookings
  without a card get a **save-card** link (Stripe Checkout in setup mode). These
  use the same webhook events listed above.

## Troubleshooting

- **"Online payment is not enabled"** — `STRIPE_SECRET_KEY` is missing or the site wasn't redeployed.
- **Paid but stuck on "Confirming your payment…"** — the webhook isn't arriving.
  Check the endpoint URL, that all 5 events are selected, and that
  `STRIPE_WEBHOOK_SECRET` matches. Stripe → Webhooks shows each delivery and its response.
- **Webhook responses of 500 "Webhook not configured"** — `STRIPE_WEBHOOK_SECRET` is not set.
