# Direct Booking Site

A direct-booking website for a small vacation-rental business (built for 2–10
properties, no hard limit). Guests book and pay on your own site — no platform
fees. Includes listing pages, a live availability + smart-pricing engine,
Stripe payments (one-time and monthly), enforced cancellation policies with
automatic refunds, guest–host messaging, Airbnb/VRBO calendar sync, and an
admin dashboard.

> **Handing this to another developer or AI tool?** Start with [`HANDOVER.md`](./HANDOVER.md).

## Stack
- **Next.js 15** (App Router, TypeScript, Server Actions) with React 18
- **PostgreSQL** via **Prisma** (Neon / Supabase / any Postgres)
- **Tailwind CSS**
- **Stripe** — optional; without keys the site runs in "Request to Book" mode
- **Resend** — optional; without a key, emails are written to the server log
- **Vercel Blob** — optional, for photo uploads (pasted image URLs always work)

## Features
| Area | What it does |
|---|---|
| Listings | Property pages with photos, amenities, house rules page, local guide page |
| Availability | Live date checks; visual calendar; abandoned checkouts release dates after ~35 min; simultaneous bookings can't double-book |
| Pricing | Base rate → seasonal overrides → smart pricing (weekend, last-minute, far-out, high/low demand) → floor/ceiling |
| Rate plans | **Moderate** (default), **Non-refundable** (10% off, stays < 30 nights), **Long stay** (18% off, 30+ nights, billed monthly) |
| Payments | Stripe Checkout; long stays charge payment 1 at booking then bill monthly from 30 days after check-in, final month prorated |
| Cancellations | Guest self-cancel from their booking link, or host cancel from admin; refund calculated by policy and issued through Stripe |
| Messaging | Guest ↔ host chat per booking |
| Calendar sync | iCal export per property + import Airbnb/VRBO calendars ("Sync now") |
| Admin | Properties, bookings, calendar, smart pricing, one-click pricing setup, Stripe setup guide |
| Damage charges | After check-out: notice with photos → charge the saved card 48h later → payment link if the card fails; save-card link for bookings without a card; $2,500 cap |
| Emails | Booking received/confirmed (with a private "manage booking" link), cancellations, failed-payment alerts |

All money amounts are computed in one place (`src/lib/quote.ts`) — what the
guest sees is exactly what Stripe charges. All policy numbers live in
`src/lib/policy.ts`; the Terms page and the refund calculator both read from it.

## Local setup

Requires Node 20+ and a PostgreSQL database (a free Neon database works fine for development).

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, SESSION_SECRET
npm run db:migrate            # creates/updates tables
npm run db:seed               # optional: 2 sample properties
npm run dev
```

- Public site: `http://localhost:3000`
- Admin: `http://localhost:3000/admin/login`
- Password hash: `node scripts/hash-password.js "your-password"`
- Session secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Deploying
See [`DEPLOY.md`](./DEPLOY.md). `npm run build` applies database migrations
automatically (`scripts/migrate.mjs`), so deploying is just: set the
environment variables, deploy. Runs on Vercel or any Node host
(`npm run build && npm start`).

## Database changes
Edit `prisma/schema.prisma`, then create a migration and commit it:

```bash
npm run db:migrate:new -- --name describe_change   # writes prisma/migrations/<timestamp>_describe_change
```

Never use `prisma db push` against production.

## Project structure

```
src/middleware.ts          protects /admin and /api/admin
src/app/                   pages + API routes (App Router)
  page.tsx                 homepage — property grid
  properties/[slug]/       property page, house-rules/, welcome/ (local guide)
  book/[slug]/             booking form; confirmation/ = guest's "manage booking" page
  terms/                   Terms & Conditions (draft — needs legal review)
  admin/                   dashboard, properties, bookings, calendar, setup, stripe-setup
  api/                     availability, bookings (+ [id]/cancel), checkout, webhooks/stripe,
                           messages, ical, admin/*
src/components/            UI (BookingWidget, PriceBreakdown, CancelBooking, calendars, forms…)
src/lib/
  policy.ts                every policy number + guest-facing policy text
  pricing.ts               availability + nightly rates
  smart-pricing.ts         smart-pricing rules
  quote.ts                 final prices for each rate plan + long-stay payment schedule
  cancellation.ts          refund calculator (pure, no I/O)
  damages.ts               damage claims, off-session charges, save-card (SetupIntent)
  booking.ts               creates bookings (serializable transaction)
  payments.ts              Stripe checkout, monthly billing, webhooks, cancellations/refunds
  email.ts, notify.ts      emails
  auth.ts, session-secret.ts  admin auth
  actions.ts               admin server actions
prisma/schema.prisma       data model
prisma/migrations/         SQL migrations (0001_init is idempotent — safe on older databases)
scripts/migrate.mjs        applies migrations during build
```

## Known limitations
- Single admin login (one email/password).
- iCal import is manual ("Sync now") — add a scheduled job to automate it.
- No automated test suite in the repo (the logic was verified with throwaway scripts during development — see HANDOVER.md).
- Times are compared in server time (UTC on Vercel); "days before check-in" means calendar days.
