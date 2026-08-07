# Deploying to Vercel — step by step

This gets you from "code on my laptop" to a live site at your own domain.
Total cost to start: **$0** (Vercel Hobby, Neon free tier, Vercel Blob free
tier all cover a small direct-booking site comfortably).

---

## 1. Put the code on GitHub

```bash
cd booking-site
git init
git add .
git commit -m "Initial commit"
```

Create a new empty repo on [github.com/new](https://github.com/new) (don't
initialize it with a README), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

## 2. Create your production database (Neon)

1. Go to [neon.tech](https://neon.tech) → sign up (free) → **New Project**.
2. Once created, copy the **connection string** it shows you — looks like
   `postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.
   Keep this tab open, you'll paste it into Vercel in step 4.
3. Back in your local project, open `prisma/schema.prisma` and change:
   ```diff
   datasource db {
   -  provider = "sqlite"
   +  provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
   Commit and push that change:
   ```bash
   git add prisma/schema.prisma
   git commit -m "Switch to Postgres for production"
   git push
   ```

## 3. Import the project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) → sign in with GitHub →
   **Import** your repo.
2. Framework preset should auto-detect as **Next.js** — leave build settings
   as default.
3. Don't click Deploy yet — first open **Environment Variables** on this
   same screen and add these (values from your local `.env` where you
   generated them, plus the Neon string from step 2):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from step 2 |
   | `ADMIN_EMAIL` | your login email |
   | `ADMIN_PASSWORD_HASH` | run `node scripts/hash-password.js "yourpassword"` locally, paste the output |
   | `SESSION_SECRET` | any long random string — e.g. run `openssl rand -hex 32` locally |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-project-name.vercel.app` for now (update after step 6) |
   | `NEXT_PUBLIC_SITE_NAME` | your business name |

   Leave `STRIPE_*`, `RESEND_API_KEY`, and `BLOB_READ_WRITE_TOKEN` unset for now — you'll add those in steps 5–6.

4. Click **Deploy**. First build will succeed but the site will error on any
   page that touches the database, because the tables don't exist yet —
   that's expected, fix it in the next step.

## 4. Create the database tables

From your local machine, temporarily point at production and push the schema:

```bash
# in booking-site/, don't commit this — just run it once
DATABASE_URL="paste-your-neon-connection-string-here" npx prisma db push
```

Optionally seed two sample properties the same way:
```bash
DATABASE_URL="paste-your-neon-connection-string-here" npx tsx prisma/seed.ts
```
(You'll replace/delete these from `/admin/properties` once you add your real ones.)

Redeploy from the Vercel dashboard (Deployments → ⋯ → Redeploy), or just
push any small commit — the site should now load properly.

## 5. Turn on image uploads (optional but recommended)

1. In your Vercel project → **Storage** tab → **Create Database** → **Blob**.
2. Once created, Vercel automatically adds `BLOB_READ_WRITE_TOKEN` to your
   project's environment variables — no manual copy-paste needed.
3. Redeploy for it to take effect. Now the admin property form's photo
   uploader works directly.

## 6. Connect your real domain

1. In Vercel → your project → **Settings → Domains** → add your domain
   (e.g. `stay.yourbusiness.com` or `yourbusiness.com`).
2. Vercel shows you either an A record or CNAME to add — go to your domain
   registrar (GoDaddy, Namecheap, Google Domains, etc) and add that DNS
   record.
3. Wait for DNS to propagate (usually minutes, sometimes a few hours).
   Vercel auto-issues an SSL certificate once it verifies.
4. Update the `NEXT_PUBLIC_SITE_URL` environment variable in Vercel to your
   real domain (`https://stay.yourbusiness.com`) and redeploy — this value
   is used in booking confirmation links and the Stripe checkout redirect.

## 7. Turn on Stripe payments (optional — skip to stay in "Request to Book" mode)

1. Create a [Stripe account](https://dashboard.stripe.com/register) if you
   don't have one, and finish their verification (needed before you can
   accept real payments).
2. In the Stripe dashboard → **Developers → API keys**, copy the
   **Secret key** and **Publishable key**.
3. Add both to Vercel's environment variables:
   `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`.
4. In Stripe → **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://your-real-domain.com/api/webhooks/stripe`
   - Event to send: `checkout.session.completed`
   - After creating it, copy the **Signing secret** and add it to Vercel as
     `STRIPE_WEBHOOK_SECRET`.
5. Redeploy. Booking forms now show "Pay and book" instead of "Request to
   book", and successful payments auto-confirm the booking.

You can start with Stripe **off** and turn it on later any time — nothing
else about the site changes.

## 8. Optional: email notifications

Without this, booking notifications just get logged (not sent) — fine to
skip while testing, but you'll want it live.

1. Create a [Resend](https://resend.com) account (free tier is generous for
   a small site).
2. Verify your sending domain (Resend walks you through adding a couple of
   DNS records — same registrar as step 6).
3. Add `RESEND_API_KEY` and `NOTIFY_EMAIL` (the address that should receive
   new-booking notifications) to Vercel's environment variables. Redeploy.

## 9. Keep Airbnb/VRBO in sync

For each property, in `/admin/properties/[id]`:
- Copy the **export URL** shown under "Calendar sync" and paste it into
  Airbnb/VRBO's "import calendar" setting for that listing.
- Paste Airbnb/VRBO's **export URL** (find it in their calendar settings)
  into the "Import calendar" field on this page, and click "Sync now"
  whenever you want to refresh it. This is manual by default — automating
  it with a daily Vercel Cron Job is a reasonable next step if you want it
  hands-off.

---

## You're live. Recap of what's now true:
- Public site + admin dashboard running on Vercel, auto-deploying on every
  `git push` to `main`.
- Real Postgres database on Neon.
- Either "Request to Book" or live Stripe payments, your choice.
- Direct photo uploads from the admin form.
- Calendar sync so you can't get double-booked against Airbnb/VRBO.
