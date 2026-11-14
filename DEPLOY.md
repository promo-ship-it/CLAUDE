# Deploying

The site needs three things: a **Node host**, a **PostgreSQL database**, and a
handful of **environment variables**. Database tables are created and updated
automatically every time the site builds — there is no manual database step.

Recommended low-cost setup: **Vercel** (hosting) + **Neon** (Postgres). Both
have free tiers. Note: Vercel's free *Hobby* plan is intended for
non-commercial use — a site taking paid bookings should use Vercel Pro
(~$20/month) or one of the alternative hosts below. Check each provider's
current terms.

---

## 1. Database (Neon)

1. Sign up at [neon.tech](https://neon.tech) → **New Project**.
2. Copy the connection string, e.g.
   `postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.

Any PostgreSQL works (Supabase, Railway, RDS, your own server).

## 2. Environment variables

Set these in your host (Vercel → Project → Settings → Environment Variables,
for Production and Preview):

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string from step 1 |
| `ADMIN_EMAIL` | yes | your admin login email |
| `ADMIN_PASSWORD_HASH` | yes | output of `node scripts/hash-password.js "your-password"` (paste the `$2a$…` value only) |
| `SESSION_SECRET` | yes | 32+ random characters — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Admin login is disabled without it. |
| `NEXT_PUBLIC_SITE_URL` | yes | your public URL, e.g. `https://stay.yourbusiness.com` (no trailing slash). Used in emails and Stripe redirects. |
| `NEXT_PUBLIC_SITE_NAME` | yes | your business name |
| `STRIPE_SECRET_KEY` | for payments | see step 5 |
| `STRIPE_PUBLISHABLE_KEY` | for payments | see step 5 |
| `STRIPE_WEBHOOK_SECRET` | for payments | see step 5 — required whenever the secret key is set |
| `RESEND_API_KEY` | for email | see step 6 |
| `NOTIFY_EMAIL` | for email | where booking/cancellation/payment alerts go |
| `EMAIL_FROM` | optional | e.g. `Your Business <bookings@yourdomain.com>` |
| `BLOB_READ_WRITE_TOKEN` | for photo uploads | added automatically by Vercel Blob (step 4) |

`.env.example` lists the same variables with comments.

## 3. Deploy

**Vercel:** [vercel.com/new](https://vercel.com/new) → import the GitHub repo →
framework auto-detects as Next.js → add the variables above → **Deploy**.
Every push to `main` redeploys.

**Any other Node host** (Render, Railway, Fly.io, a VPS):

```bash
npm ci
npm run build     # runs migrations, then builds
npm start         # serves on $PORT (default 3000)
```

On first deploy against an empty database the build creates all tables. If the
database was created by an older version of this app (which used
`prisma db push`), the build upgrades it in place without touching existing data.

> GitHub + Vercel Hobby: if the repo is **private**, Vercel blocks deploys of
> commits authored by anyone other than the account owner (including AI tools).
> Keep the repo public, or use Vercel Pro.

After deploying:
1. Visit `/admin/login` and sign in.
2. Add properties at `/admin/properties` (or run `npm run db:seed` locally against the database for two samples).
3. Optional: `/admin/setup` applies the recommended smart-pricing rules to all properties in one click.

## 4. Photo uploads (optional)

Vercel → Project → **Storage** → **Create** → **Blob**. Vercel adds
`BLOB_READ_WRITE_TOKEN` automatically; redeploy. Without it, paste image URLs
into the property form instead (any public image host works).

## 5. Online payments — Stripe (optional)

Full walkthrough: `/admin/stripe-setup` on your site (downloadable), or
`public/stripe-setup-instructions.md`. Summary:

1. Stripe → **Developers → API keys** → copy the secret and publishable keys.
2. Stripe → **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-DOMAIN/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.expired`,
     `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
   - Copy the signing secret.
3. Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`; redeploy.

Use test keys and card `4242 4242 4242 4242` first. For live payments, repeat
with live keys and a live-mode webhook.

## 6. Email — Resend (optional)

1. Sign up at [resend.com](https://resend.com) and verify your sending domain (DNS records at your registrar).
2. Set `RESEND_API_KEY`, `NOTIFY_EMAIL`, and `EMAIL_FROM` (an address on the verified domain); redeploy.

Without Resend, emails are written to the host's logs instead of sent —
guests won't receive their "manage booking" link, so set this up before launch.

## 7. Custom domain

Vercel → Project → **Settings → Domains** → add your domain → add the DNS record
Vercel shows at your registrar. SSL is automatic. Then update
`NEXT_PUBLIC_SITE_URL` (and the Stripe webhook URL) and redeploy.

## 8. Airbnb / VRBO calendar sync

For each property at `/admin/properties/[id]` → **Calendar sync**:
- Paste the **export URL** shown there into Airbnb/VRBO's "import calendar".
- Paste Airbnb/VRBO's export URL into **Import calendar** and click **Sync now**.
  (Manual by default — see HANDOVER.md for automating it.)
