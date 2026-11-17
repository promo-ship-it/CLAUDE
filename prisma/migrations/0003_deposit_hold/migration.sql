-- 0003_deposit_hold — refundable security deposit hold fields. Additive only.

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('SCHEDULED', 'PLACING', 'HELD', 'RENEWING', 'CAPTURING', 'FAILED', 'CAPTURED', 'RELEASED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "depositAmount" INTEGER,
ADD COLUMN     "depositAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositCapturedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositHeldUntil" TIMESTAMP(3),
ADD COLUMN     "depositNote" TEXT,
ADD COLUMN     "depositPaymentIntentId" TEXT,
ADD COLUMN     "depositStatus" "DepositStatus";

-- AlterTable
ALTER TABLE "DamageClaim" ADD COLUMN     "fromDepositAmount" INTEGER NOT NULL DEFAULT 0;

