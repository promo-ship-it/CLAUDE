-- 0002_damage_claims — post-checkout damage claims + saved-card fields on Booking.
-- Additive only (new enum, new table, three nullable columns).

-- CreateEnum
CREATE TYPE "DamageClaimStatus" AS ENUM ('NOTICE_SENT', 'CHARGING', 'CHARGED', 'PAYMENT_LINK_SENT', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cardRequestedAt" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripePaymentMethodId" TEXT;

-- CreateTable
CREATE TABLE "DamageClaim" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "photoUrls" TEXT NOT NULL,
    "status" "DamageClaimStatus" NOT NULL DEFAULT 'NOTICE_SENT',
    "noticeSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chargeAfter" TIMESTAMP(3) NOT NULL,
    "stripePaymentIntentId" TEXT,
    "failureReason" TEXT,
    "chargedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DamageClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DamageClaim_bookingId_idx" ON "DamageClaim"("bookingId");

-- AddForeignKey
ALTER TABLE "DamageClaim" ADD CONSTRAINT "DamageClaim_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

