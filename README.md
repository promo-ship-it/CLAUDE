# Direct Booking Site 


A production-ready direct-booking website for 2–10 vacation rental properties —
public listing pages, a real-time availability + pricing engine, a booking flow
(inquiry-only or Stripe checkout), iCal sync with Airbnb/VRBO, and an admin
dashboard to manage everything. No booking-platform fees.

## Stack
- **Next.js 14** (App Router, TypeScript, Server Actions)
- **Prisma** — SQLite for local dev, swap one env var for Postgres in production
- **Tailwind CSS**
- **Stripe** (optional — off by default, site runs in "Request to Book" mode until you add keys)
- **Resend** (optional — emails log to console until you add a key)

## 1. Local setup

```bash
npm install
cp .env.example .env
npx prisma db push       # creates dev.db (SQLite) from the schema
npm run db:seed          # adds 2 sample properties so you can see the site
npm run dev
```

Visit `http://localhost:3000` for the public site.

### Admin dashboard

Generate a password hash and put it in `.env`:

```bash
node scripts/hash-password.js "your-chosen-password"
# copy the printed ADMIN_PASSWORD_HASH into .env
```

Also set `ADMIN_EMAIL` and a long random `SESSION_SECRET` in `.env`. Then visit
`http://localhost:3000/admin/login`.

From the admin dashboard you can:
- Add/edit/unpublish/delete properties (2–10, no hard limit in the code)
- Set nightly rate, cleaning fee, tax rate, minimum nights, amenities, photos
- Manually block dates (maintenance, personal use)
- Import an Airbnb/VRBO `.ics` calendar URL so this site never double-books
- Export **this** site's bookings as an `.ics` feed to paste into Airbnb/VRBO
- View and confirm/decline booking requests

## 2. How booking works

- A guest picks dates on a property page → the site checks availability and
  price live (`/api/availability`).
- If Stripe keys are **not** set: submitting the form creates a `PENDING`
  booking and emails you + the guest. You confirm it manually from
  `/admin/bookings`. This is the default, safest starting mode.
- If Stripe keys **are** set: submitting the form creates a Stripe Checkout
  session. On successful payment, a webhook marks the booking `CONFIRMED`
  automatically.
- Either way, confirmed/pending bookings immediately block those dates for
  every other visitor — there's no double-booking window.

### Turning on Stripe payments later
1. Get your keys from the Stripe dashboard.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in your production env.
3. Add a webhook endpoint in Stripe pointing to `https://yoursite.com/api/webhooks/stripe`
   listening for `checkout.session.completed`, and set `STRIPE_WEBHOOK_SECRET`.
4. Redeploy. No code changes needed — the site detects the keys automatically.

### Keeping Airbnb/VRBO in sync
Each property has an export URL at `/api/ical/[slug]` — paste that into Airbnb's
or VRBO's "import calendar" field. In the other direction, paste Airbnb's export
URL into this site's admin page for that property (under "Calendar sync") and
click "Sync now". Set up a daily cron (e.g. a Vercel Cron Job hitting a small
sync route, or GitHub Actions) if you want it automatic rather than manual.

## 3. Deploying to production

See [`DEPLOY.md`](./DEPLOY.md) for a full click-by-click walkthrough
(GitHub → Vercel → Neon Postgres → Vercel Blob for image uploads → your
domain → optional Stripe/email setup). Short version:

**Recommended: Vercel (hosting) + Neon or Supabase (Postgres database)**

1. Push this project to a GitHub repo.
2. Create a free Postgres database on [Neon](https://neon.tech) or
   [Supabase](https://supabase.com) — copy the connection string.
3. In `prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Import the repo into Vercel. Set these environment variables in the Vercel
   project settings (same names as `.env.example`):
   `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`,
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME`, and the Stripe/Resend
   keys once you're ready for them.
5. Vercel's build will run `next build`. Run `npx prisma db push` once
   (locally, pointed at the production `DATABASE_URL`, or via a one-off
   Vercel deploy hook) to create the tables, then seed or add properties
   from `/admin`.
6. Point your domain's DNS at Vercel, and update `NEXT_PUBLIC_SITE_URL`.

This also runs fine on any other Node host (Railway, Render, Fly.io, a VPS) —
`npm run build && npm run start`, same env vars, any Postgres database.

## 4. Project structure

```
src/app/                   pages + API routes (App Router)
  page.tsx                 homepage — property grid
  properties/[slug]/       property detail + booking widget
  book/[slug]/             guest details form + confirmation
  admin/                   admin dashboard (protected by middleware.ts)
  api/                     availability, bookings, checkout, webhooks, ical export
src/components/            PropertyCard, BookingWidget, Nav, Footer, PropertyForm
src/lib/                   prisma client, pricing/availability engine, auth,
                            ical import/export, stripe, email, server actions
prisma/schema.prisma       data model
```

## 5. Extending it

- **Branding**: colors in `tailwind.config.ts`, site name in `.env`
  (`NEXT_PUBLIC_SITE_NAME`), copy in `src/app/page.tsx`.
- **Seasonal pricing**: the `PriceRule` model already supports date-range
  overrides — add an admin UI for it or set rows directly via `prisma studio`
  (`npm run db:studio`).
- **More than 10 properties**: nothing in the code caps the count — the
  "2–10" framing was just about scale/complexity, not a hard limit.
- **Multi-currency / i18n**: not included — `formatCents()` in `src/lib/pricing.ts`
  is the one place currency formatting happens.

## Known limitations (be aware of these before launch)

- Photo uploads use Vercel Blob storage — set `BLOB_READ_WRITE_TOKEN` (see
  `DEPLOY.md`) to enable them. Without it, the admin form still accepts
  pasted image URLs (any host/CDN works).
- iCal import is manual ("Sync now") unless you wire up a cron job.
- Admin auth is single-user (one email/password), which fits a small owner-operated
  site; add a `User` table if multiple staff need separate logins.   
  
