# Stripe Payment Setup Instructions

Follow these steps to enable live payments on your direct booking site.

---

## Step 1: Create a Stripe Account

1. Go to https://dashboard.stripe.com/register
2. Sign up with your email and create an account
3. Complete Stripe's business verification (required before accepting real payments)

---

## Step 2: Get Your API Keys

1. Log into https://dashboard.stripe.com
2. Click **Developers** in the left sidebar (or top nav)
3. Click **API keys**
4. You'll see two keys:
   - **Publishable key** — starts with `pk_test_` (test) or `pk_live_` (live)
   - **Secret key** — starts with `sk_test_` (test) or `sk_live_` (live)
5. Copy both keys — you'll paste them into Vercel in Step 4

**TIP:** Start with TEST keys (toggle "Test mode" in the top-right of the Stripe dashboard). This lets you test bookings without real charges. Switch to LIVE keys when you're ready to accept real money.

---

## Step 3: Create a Webhook Endpoint

1. In the Stripe dashboard, go to **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Set the **Endpoint URL** to:

   ```
   https://YOUR-DOMAIN.vercel.app/api/webhooks/stripe
   ```

   (Replace YOUR-DOMAIN with your actual Vercel URL)

4. Under **"Select events to listen to"**, click **"+ Select events"** and add:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`

5. Click **"Add endpoint"**
6. Once created, click on your endpoint → click **"Reveal"** next to "Signing secret"
7. Copy the signing secret — starts with `whsec_`

---

## Step 4: Add Keys to Vercel

1. Go to https://vercel.com → click your project → **Settings** → **Environment Variables**
2. Add these three variables:

   | Key                        | Value                    |
   |----------------------------|--------------------------|
   | `STRIPE_SECRET_KEY`        | `sk_test_...` or `sk_live_...` |
   | `STRIPE_PUBLISHABLE_KEY`   | `pk_test_...` or `pk_live_...` |
   | `STRIPE_WEBHOOK_SECRET`    | `whsec_...`              |

3. Make sure "Production and Preview" is selected for the environment

---

## Step 5: Redeploy

1. Go to GitHub: https://github.com/promo-ship-it/CLAUDE/blob/main/README.md
2. Click the pencil icon (edit)
3. Add a blank line or space
4. Click "Commit changes"
5. Wait 2-3 minutes for Vercel to redeploy

---

## Step 6: Test It

1. Visit your site and try booking a property
2. You should now see **"Pay $XXX and book"** instead of "Send request to book"
3. With TEST keys, use Stripe's test card: `4242 4242 4242 4242` (any future expiry, any CVC)
4. After payment, the booking should auto-confirm

---

## Going Live (When Ready)

1. In Stripe dashboard, toggle OFF "Test mode" (top-right corner)
2. Copy your LIVE keys (`pk_live_...` and `sk_live_...`)
3. Create a new webhook endpoint with the same URL and events (live mode has separate webhooks)
4. Update the 3 environment variables in Vercel with the live values
5. Redeploy

**IMPORTANT:** In live mode, Stripe requires completed business verification before you can accept payments.

---

## Troubleshooting

- **"Online payment is not enabled"** — The STRIPE_SECRET_KEY environment variable isn't set or the deploy hasn't picked it up yet. Check Vercel env vars and redeploy.
- **Payment succeeds but booking stays PENDING** — The webhook isn't reaching your site. Check that STRIPE_WEBHOOK_SECRET is correct and the endpoint URL matches exactly.
- **"Invalid signature" errors in logs** — The STRIPE_WEBHOOK_SECRET doesn't match. Re-copy it from Stripe → Developers → Webhooks → your endpoint → Signing secret.

---

## Monthly Recurring Payments (30+ Night Stays)

These work automatically once Stripe is connected. For stays of 30 nights or more:
- Guest is charged monthly (not all upfront)
- The additional webhook events (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`) handle the recurring billing lifecycle
- An 18% long-stay discount is automatically applied

No additional Stripe configuration needed — just make sure all 4 webhook events from Step 3 are enabled.
