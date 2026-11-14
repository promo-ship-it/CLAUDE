-- 0001_init — full schema, written to be IDEMPOTENT.
--
-- Earlier versions of this app created tables with `prisma db push`, so a
-- production database may already contain some or all of these objects.
-- Every statement below is safe to run against:
--   * an empty database (creates everything), or
--   * a database created by any earlier `db push` of this app (adds only
--     what's missing, never drops or rewrites data).
-- After this, all future schema changes are normal Prisma migrations.

-- ── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "MessageSender" AS ENUM ('GUEST', 'HOST'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PaymentType" AS ENUM ('INQUIRY', 'STRIPE', 'STRIPE_RECURRING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SmartPricingType" AS ENUM ('DAY_OF_WEEK', 'LAST_MINUTE', 'FAR_OUT', 'HIGH_DEMAND', 'LOW_DEMAND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CancellationPolicy" AS ENUM ('MODERATE', 'NON_REFUNDABLE', 'LONG_TERM_FIRM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum values added after the first deploy
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'STRIPE_RECURRING';

-- ── Tables (full definitions for a fresh database) ─────────────────────────
CREATE TABLE IF NOT EXISTS "Property" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "maxGuests" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "beds" INTEGER NOT NULL,
    "baths" DOUBLE PRECISION NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "cleaningFee" INTEGER NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minNights" INTEGER NOT NULL DEFAULT 2,
    "minPrice" INTEGER,
    "maxPrice" INTEGER,
    "amenities" TEXT NOT NULL,
    "images" TEXT NOT NULL,
    "houseRules" TEXT,
    "welcomeGuide" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "smartPricingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Booking" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestPhone" TEXT,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "guests" INTEGER NOT NULL,
    "nights" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "cleaningFee" INTEGER NOT NULL,
    "taxTotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "paymentType" "PaymentType" NOT NULL DEFAULT 'INQUIRY',
    "stripeSessionId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "monthlyAmount" INTEGER,
    "totalPayments" INTEGER,
    "proratedFinal" INTEGER,
    "paymentSchedule" TEXT,
    "cancellationPolicy" "CancellationPolicy" NOT NULL DEFAULT 'MODERATE',
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "discountLabel" TEXT,
    "termsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "refundAmount" INTEGER,
    "cancellationNote" TEXT,
    "notes" TEXT,
    "messageToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "stripeRef" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LoginAttempt" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BlockedDate" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlockedDate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PriceRule" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "label" TEXT,
    CONSTRAINT "PriceRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IcalSource" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    CONSTRAINT "IcalSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SmartPricingRule" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "ruleType" "SmartPricingType" NOT NULL,
    "threshold" TEXT,
    "adjustment" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmartPricingRule_pkey" PRIMARY KEY ("id")
);

-- ── Columns added after the first deploy (no-ops on a fresh database) ──────
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "minPrice" INTEGER;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "maxPrice" INTEGER;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "houseRules" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "welcomeGuide" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "smartPricingEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "monthlyAmount" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "totalPayments" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "proratedFinal" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "paymentSchedule" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "cancellationPolicy" "CancellationPolicy" NOT NULL DEFAULT 'MODERATE';
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "discountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "discountLabel" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "refundAmount" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "cancellationNote" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "messageToken" TEXT;

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "Property_slug_key" ON "Property"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_messageToken_key" ON "Booking"("messageToken");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripeRef_key" ON "Payment"("stripeRef");
CREATE INDEX IF NOT EXISTS "Payment_bookingId_idx" ON "Payment"("bookingId");
CREATE INDEX IF NOT EXISTS "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "BlockedDate_propertyId_date_source_key" ON "BlockedDate"("propertyId", "date", "source");
CREATE UNIQUE INDEX IF NOT EXISTS "AdminSession_token_key" ON "AdminSession"("token");

-- ── Foreign keys (added only if missing) ───────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Booking_propertyId_fkey') THEN
    ALTER TABLE "Booking" ADD CONSTRAINT "Booking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_bookingId_fkey') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_bookingId_fkey') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BlockedDate_propertyId_fkey') THEN
    ALTER TABLE "BlockedDate" ADD CONSTRAINT "BlockedDate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceRule_propertyId_fkey') THEN
    ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IcalSource_propertyId_fkey') THEN
    ALTER TABLE "IcalSource" ADD CONSTRAINT "IcalSource_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SmartPricingRule_propertyId_fkey') THEN
    ALTER TABLE "SmartPricingRule" ADD CONSTRAINT "SmartPricingRule_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
