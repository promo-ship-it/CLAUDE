# Handover — Direct Booking Site

Read this first. It tells you what's built, what was verified, what only the
owner can do, and what's left.

## 1. Current state (as of this handover)

- **Code:** complete for launch. Builds cleanly on Next.js 15.5.29; `npm audit --omit=dev` reports 0 vulnerabilities.
- **Hosting today:** Vercel project connected to this GitHub repo (`main` auto-deploys), Neon Postgres. The repo is public so Vercel Hobby doesn't block deploys.
- **Payments:** Stripe code is complete, but the owner has **not yet** added Stripe keys, so the live site is in "Request to Book" mode.
- **Email:** Resend not configured yet, so emails only go to the server log.
- **Legal:** Terms & Conditions (`/terms`) are a **draft**. A lawyer must review them before launch.

## 2. What the site does

| Area | Status |
|---|---|
| Listings, property pages, house rules page, local guide page | Done |
| Availability + calendar (guest and admin) | Done |
| Smart pricing (weekend +15%, last-minute −10% within 5 days, far-out −5% at 90+ days, high demand +20% at 70%+ booked, low demand −15% under 20%), floor $75, ceiling $180, base $90 | Done; one-click setup at `/admin/setup` |
| Rate plans: Moderate (default), Non-refundable 10% off, Long stay 18% off with monthly billing | Done |
| Stripe Checkout, monthly billing, webhooks | Done (fake-Stripe tested; not yet run against real Stripe test mode) |
| Guest self-service cancel + host cancel with automatic refunds | Done |
| Guest ↔ host messaging | Done |
| Required phone number, required T&C acceptance (version recorded per booking) | Done |
| Emails with private "manage booking" link | Done (needs Resend keys to actually send) |
| iCal export/import (Airbnb/VRBO) | Done (import is manual "Sync now") |
| Admin login rate limit (5 failures / 15 min / IP) | Done |
| Post-checkout damage charges: notice with photos → 48h → off-session charge on the saved card → payment-link fallback; save-card link (SetupIntent) for bookings without a card; $2,500 cap per booking | Done (fake-Stripe tested) |

## 3. Decisions already made by the owner (don't change without asking)

**Cancellation policy** — all numbers in `src/lib/policy.ts`:
- **Moderate (stays < 30 nights, default):** full refund 5+ days before check-in; also a full refund within 48h of booking if check-in is 7+ days away. Inside 5 days, the host keeps 1 night + 50% of the remaining nights (the cleaning fee and taxes follow the same proportion). After check-in, the host keeps nights stayed + 1 night + 50% of the rest.
- **Non-refundable (stays < 30 nights):**
  - 10% off the nightly rate only (not the cleaning fee).
  - Offered only if check-in is 5+ days away, checkout is within 60 days of booking, and Stripe is enabled.
  - Full refund within 24h of booking if check-in is 7+ days away. After that, nothing is refunded, **including the cleaning fee and tax**. The owner chose to keep the tax.
  - It may push the price below the $75 floor; the owner approved this.
- **Long stay, Firm (30+ nights):**
  - 18% off, which replaces smart-pricing discounts (smart-pricing surcharges still apply).
  - Full refund 30+ days before check-in.
  - Otherwise the guest owes nights stayed + 30 nights. The site refunds any overpayment, or charges any shortfall to the saved card.
- One policy set, site-wide.

**Other decisions:**
- Check-in is 3:00 PM and check-out is 11:00 AM.
- Long-stay billing: payment 1 at booking (first 30 nights + cleaning fee, incl. tax); payment 2 is 30 days after check-in, then monthly. The last payment is prorated, and billing stops automatically.
- Cards are saved for every Stripe booking. Damage charges (Terms §5) are made from `/admin/bookings`: the guest gets a notice with description and photos, the card can be charged **48 hours** later (`DAMAGE_NOTICE_HOURS`), with a **$2,500 total cap per booking**. The 48-hour window was the developer's recommended default to reduce chargebacks; the owner can change it in `policy.ts` (bump `TERMS_VERSION`).

## 4. Owner-only tasks (accounts, keys, content, legal)

- [ ] **Rotate secrets.** The current admin password, its hash, and `SESSION_SECRET` were shared in a chat transcript. Generate new ones (commands in DEPLOY.md §2) and update them in Vercel.
- [ ] **Stripe:** create keys and the webhook with all **5** events (DEPLOY.md §5), add the 3 env vars, then redeploy.
- [ ] **Resend:** verify the sending domain and set `RESEND_API_KEY`, `NOTIFY_EMAIL`, `EMAIL_FROM`. This is needed before launch, because guests get their manage-booking link by email.
- [ ] **Custom domain:** add it in Vercel, then update `NEXT_PUBLIC_SITE_URL` and the Stripe webhook URL.
- [ ] **Hosting plan:** Vercel Hobby is for non-commercial use, so move to Pro or another host before taking paid bookings.
- [ ] **Content:** real properties, photos (Vercel Blob or image URLs), house rules, local guide, support email.
- [ ] **Legal review** of `/terms`, especially non-refundable wording, keeping tax on cancelled non-refundable stays, saved-card damage charges, and local short-term-rental/occupancy-tax rules.
- [ ] **Stripe go-live:** business verification, live keys, and a live-mode webhook.

## 5. Architecture — invariants to keep

- **One source of truth for money:** `src/lib/quote.ts` computes the final price for each plan. The UI displays it, `booking.ts` stores it, and `payments.ts` charges it. Never recompute totals in the UI.
- **One source of truth for policy:** `src/lib/policy.ts`. The Terms page, the booking form text, emails, and `cancellation.ts` all read from it. If you change a number, bump `TERMS_VERSION`.
- **Refunds:** `src/lib/cancellation.ts` is pure, with no I/O. `payments.ts#cancelBooking` executes the result through Stripe using idempotency keys.
- **Bookings:** created in a SERIALIZABLE transaction (`booking.ts`), so concurrent requests can't double-book. Unpaid Stripe checkouts hold dates for 35 minutes (`activeBookingWhere`).
- **Webhooks:** must be signed (unsigned requests are rejected), and handlers are idempotent. Payments are recorded in `Payment`, which has a unique `stripeRef`.
- **Database:** migrations only. `npm run build` runs `scripts/migrate.mjs`, which upgrades databases left by the old `db push` setup once. **Never** run `prisma db push --accept-data-loss` against production.
- **Admin auth:** `src/middleware.ts` (it must live in `src/`), plus `requireAdminPage()` on admin pages, plus `requireAdmin()` in every server action.
- **Damage claims:** `src/lib/damages.ts`, stored in `DamageClaim`, **not** in `Payment` (which drives cancellation refunds). Off-session charges use idempotency key `damage-<claimId>-<paymentMethodId>`. A claim moves `NOTICE_SENT → CHARGING → CHARGED`, or `→ PAYMENT_LINK_SENT → PAID`. A second payment for the same claim is refunded automatically.
- **Guest access:** the private token in `?t=` (`Booking.messageToken`) gates the booking page, messages, and cancel.

## 6. What was verified, and how

Tested in the build sandbox against a local Postgres-compatible database (PGlite), plus a fake Stripe client:
- **Migrations:** fresh database ✓; databases created by both earlier deployed schemas, with existing data ✓; repeat runs are no-ops ✓.
- **34 logic checks:**
  - every refund rule (including the $360 / 4-night example → $135 refund);
  - quote math, floor/ceiling, and non-refundable eligibility windows;
  - long-stay schedules that sum exactly to the total, for 30/45/60/90 nights;
  - double-booking prevention, and abandoned-checkout release;
  - the full long-stay billing lifecycle: subscription start date, switch to the prorated final amount, stop after the last payment, duplicate-webhook safety;
  - refunds issued via Stripe, the long-stay shortfall charge, and auto-refund of a payment that arrives late.
- **33 damage-charge checks:** notice period, cap, photo rules, off-session charge, auth-required/declined/outage fallbacks, payment link + webhook, duplicate-payment refund, save-card SetupIntent flow, eligibility rules; plus **18 HTTP checks** for the damage routes, guest page, and Terms. Migration `0002` tested on a database matching production.
- **4 webhook checks:** missing secret, unsigned, forged, and valid signatures.
- **33 HTTP checks** against `next start`:
  - all public pages;
  - required phone and terms;
  - token-protected booking page, messages, and cancel;
  - admin redirect when logged out, and admin pages with a session;
  - login lockout and iCal export.

**Not yet verified (do this in acceptance, §7):**
- real Stripe test mode, end to end;
- real Postgres under truly concurrent load (PGlite serializes connections);
- actual email delivery;
- visual and mobile layout in a browser (pages render, but nobody has visually reviewed them).

## 7. Acceptance checklist (run with Stripe test keys)

1. Book a 4-night stay 20+ days out → choose **Non-refundable** → pay with `4242 4242 4242 4242` → the booking page shows Confirmed. Stripe shows the exact total from the booking page.
2. Book the standard rate for other dates → cancel from the email link → the refund appears in Stripe.
3. Book 45 nights → Stripe shows payment 1, plus a subscription with a trial ending 30 days after check-in at the final prorated amount.
4. From `/admin/bookings`, cancel a booking as host with a full refund.
5. Start a checkout and close the tab → within ~35 minutes the dates are bookable again, and the `checkout.session.expired` webhook marks it cancelled.
6. Visit `/admin/bookings` in a private window → you're redirected to login.
7. Send a guest message, then reply from admin.
8. **Damage charge:** on a test booking whose check-out has passed, click **Report damage**. Then in the database set the claim's `chargeAfter` to the past (or wait 48h), click **Charge**, and confirm Stripe shows an off-session payment on the saved card. Repeat with Stripe's card `4000 0027 6000 3184` (requires authentication) and check that the guest gets a payment link that works.
9. On a booking without a card, click **Ask guest to save a card**, complete the link, and confirm admin shows **Card on file: yes**.
10. Review every page on a phone-sized screen.

## 8. Optional next work (in priority order)

1. **Automatic iCal sync:** a cron route (Vercel Cron or GitHub Actions) that calls `syncIcalSource` for every source each hour, protected by a `CRON_SECRET`.
2. **Reminder emails:** before check-in (with access instructions) and before each monthly payment.
3. **Per-property time zone** (currently UTC calendar days).
4. **Automated tests:** port the checks from §6 into a real test suite (Vitest + a Postgres container).
5. **React 19 / Next 16** upgrade (Next 15 + React 18 is supported today).
6. Guest reviews, search/filters, and multiple admin users.

## 9. Avoiding paywalls

- Everything runs on free tiers except commercial hosting (see §4), plus Stripe's per-transaction fees.
- Next's image optimizer is turned off (`next.config.js`), so there's no Vercel image-optimization quota.
- **Vercel Blob** is the only Vercel-specific service. Replacing it (e.g. Cloudflare R2 or S3) means changing `src/app/api/admin/upload/route.ts` only.
- **Neon** can be swapped for any Postgres by changing `DATABASE_URL`.

## 10. Scope of this repo

This repo contains only the direct booking site. The owner's separate 100-day fitness tracker now lives in its own private repo, `promo-ship-it/fit100`. Don't add it back here.

## 11. Ready-to-paste prompt for the next AI tool

> This repo is a complete Next.js 15 + Prisma + Postgres direct-booking site. Read `HANDOVER.md` first and follow its invariants (section 5). Don't change the owner's decisions in section 3. Your job:
> 1. Help me finish the owner-only setup in section 4 (Stripe keys + webhook with all 5 events, Resend, domain, rotated secrets).
> 2. Run the acceptance checklist in section 7 with Stripe test mode and fix anything that fails.
> 3. Then, only if I ask, build items from section 8.
>
> Never run `prisma db push` against production. For schema changes, add a migration in `prisma/migrations`. Keep all prices coming from `src/lib/quote.ts` and all policy numbers in `src/lib/policy.ts`.
