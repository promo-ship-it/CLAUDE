import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { SITE } from "@/lib/config";
import { format } from "date-fns";
import Link from "next/link";
import GuestMessages from "@/components/GuestMessages";
import CancelBooking from "@/components/CancelBooking";
import {
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  DEPOSIT_PLACE_DAYS_BEFORE,
  DEPOSIT_RELEASE_DAYS,
  POLICY_NAMES,
  POLICY_SUMMARIES,
  type RatePlan
} from "@/lib/policy";
import type { ScheduleItem } from "@/lib/quote";

export const dynamic = "force-dynamic";

// "Your booking" page. Requires the private token from the booking link
// (?t=...) — the same link is in every booking email.
export default async function ConfirmationPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ bookingId?: string; t?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const booking = searchParams.bookingId
    ? await prisma.booking.findUnique({
        where: { id: searchParams.bookingId },
        include: {
          property: true,
          payments: { orderBy: { paidAt: "asc" } },
          damageClaims: { where: { status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" } }
        }
      })
    : null;

  const authorized = booking && booking.messageToken && searchParams.t === booking.messageToken;

  if (!booking || !authorized) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl mb-4">We couldn't open that booking</h1>
        <p className="text-ink/60 mb-8">Use the link in your booking email to view, message us about, or cancel your stay.</p>
        <Link href="/" className="btn-secondary">Back home</Link>
      </div>
    );
  }

  const plan = booking.cancellationPolicy as RatePlan;
  const schedule: ScheduleItem[] | null = booking.paymentSchedule ? JSON.parse(booking.paymentSchedule) : null;
  const paid = booking.payments.filter((p) => p.kind !== "SHORTFALL").reduce((s, p) => s + p.amount, 0);
  const refunded = booking.payments.reduce((s, p) => s + p.refundedAmount, 0);
  const awaitingPayment = booking.status === "PENDING" && booking.paymentType !== "INQUIRY";

  const heading = {
    CONFIRMED: ["Booking confirmed", "You're all set."],
    PENDING: awaitingPayment ? ["Finishing up", "Confirming your payment…"] : ["Request received", "We'll be in touch soon."],
    CANCELLED: ["Cancelled", "This booking was cancelled."],
    COMPLETED: ["Stay completed", "Thanks for staying with us."]
  }[booking.status];

  return (
    <div className="max-w-xl mx-auto px-6 py-24 text-center">
      <p className="label-eyebrow mb-3">{heading[0]}</p>
      <h1 className="text-3xl md:text-4xl mb-6">{heading[1]}</h1>
      <p className="text-ink/70 mb-10">
        {booking.status === "CONFIRMED" && `Your stay at ${booking.property.name} is confirmed. Check-in ${CHECK_IN_TIME}, check-out ${CHECK_OUT_TIME}.`}
        {booking.status === "PENDING" && !awaitingPayment && `We've received your request for ${booking.property.name} and will confirm within 24 hours.`}
        {awaitingPayment && "This usually takes a few seconds. Refresh this page in a moment."}
        {booking.status === "CANCELLED" &&
          `Refund: ${formatCents(booking.refundAmount ?? refunded)}. ${booking.cancellationNote ?? ""}`}
      </p>

      <div className="ledger-card p-6 text-left font-mono text-sm space-y-2">
        <div className="flex justify-between"><span className="text-ink/60">Property</span><span>{booking.property.name}</span></div>
        <div className="flex justify-between">
          <span className="text-ink/60">Dates</span>
          <span>{format(booking.checkIn, "MMM d")} → {format(booking.checkOut, "MMM d, yyyy")}</span>
        </div>
        <div className="flex justify-between"><span className="text-ink/60">Guests</span><span>{booking.guests}</span></div>
        {booking.discountAmount > 0 && (
          <div className="flex justify-between text-sage"><span>{booking.discountLabel}</span><span>−{formatCents(booking.discountAmount)}</span></div>
        )}
        <div className="flex justify-between pt-2 rule font-semibold"><span>Total</span><span>{formatCents(booking.total)}</span></div>
        {paid > 0 && <div className="flex justify-between text-ink/60"><span>Paid so far</span><span>{formatCents(paid)}</span></div>}
        {refunded > 0 && <div className="flex justify-between text-ink/60"><span>Refunded</span><span>{formatCents(refunded)}</span></div>}
        {schedule && (
          <div className="pt-3 mt-2 rule space-y-1 text-xs">
            <p className="text-ink/50 uppercase tracking-wide">Payment schedule</p>
            {schedule.map((s) => (
              <div key={s.label} className="flex justify-between gap-4 text-ink/70">
                <span>{s.label} · {s.due === "At booking" ? "at booking" : s.due}</span>
                <span>{formatCents(s.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-ink/60 text-left mt-4 leading-relaxed">
        <span className="font-medium text-ink">Cancellation policy — {POLICY_NAMES[plan]}:</span> {POLICY_SUMMARIES[plan]}
      </p>

      <div className="mt-6 flex justify-center gap-6 text-sm">
        <Link href={`/properties/${params.slug}/house-rules`} className="text-brick hover:underline">House rules</Link>
        <Link href={`/properties/${params.slug}/welcome`} className="text-brick hover:underline">Local guide</Link>
      </div>

      {(booking.status === "CONFIRMED" || (booking.status === "PENDING" && !awaitingPayment)) && (
        <div className="mt-8">
          <CancelBooking bookingId={booking.id} token={searchParams.t} />
        </div>
      )}

      {booking.depositAmount && booking.depositStatus && booking.status !== "PENDING" && (
        <div className="ledger-card p-5 mt-8 text-left text-sm">
          <p className="font-medium mb-1">Security hold: {formatCents(booking.depositAmount)}</p>
          <p className="text-ink/60">
            {booking.depositStatus === "SCHEDULED" &&
              `A refundable hold (not a charge) will be placed on your card ${DEPOSIT_PLACE_DAYS_BEFORE} day before check-in and released ${DEPOSIT_RELEASE_DAYS} days after check-out unless damage is reported.`}
            {["PLACING", "RENEWING", "CAPTURING"].includes(booking.depositStatus) && "Updating…"}
            {booking.depositStatus === "HELD" &&
              `Held on your card (not charged). Released ${DEPOSIT_RELEASE_DAYS} days after check-out unless damage is reported.`}
            {booking.depositStatus === "FAILED" &&
              "We couldn't place the hold on your card. Please save a working card (prepaid cards aren't accepted). Nothing is charged when you save it."}
            {booking.depositStatus === "CAPTURED" && `${formatCents(booking.depositCapturedAmount)} was used for the damage report below; the rest was released.`}
            {booking.depositStatus === "RELEASED" && "Released."}
          </p>
          {booking.depositStatus === "FAILED" && SITE.paymentsEnabled && (
            <a href={`/api/bookings/${booking.id}/save-card?t=${booking.messageToken}`} className="btn-primary mt-3 inline-flex">
              Save a working card
            </a>
          )}
        </div>
      )}

      {booking.damageClaims.length > 0 && (
        <div className="ledger-card p-5 mt-8 text-left text-sm">
          <p className="font-medium mb-2">Damage report</p>
          {booking.damageClaims.map((c, i) => (
            <div key={c.id} className={i > 0 ? "rule pt-3 mt-3" : ""}>
              <div className="flex justify-between font-mono">
                <span>{formatCents(c.amount)}</span>
                <span className="text-ink/60">
                  {c.status === "NOTICE_SENT" && `Charge scheduled for ${format(c.chargeAfter, "MMM d, yyyy")}`}
                  {c.status === "CHARGING" && "Processing"}
                  {c.status === "CHARGED" && "Charged to your card"}
                  {c.status === "PAYMENT_LINK_SENT" && "Payment needed"}
                  {c.status === "PAID" && "Paid — thank you"}
                </span>
              </div>
              <p className="text-ink/70 mt-1 whitespace-pre-line">{c.description}</p>
              <p className="mt-1 text-xs">
                {(JSON.parse(c.photoUrls) as string[]).map((u, n) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="text-brick hover:underline mr-3">
                    Photo {n + 1}
                  </a>
                ))}
              </p>
              {c.status === "PAYMENT_LINK_SENT" && (
                <a href={`/api/damage-claims/${c.id}/pay?t=${booking.messageToken}`} className="btn-primary mt-3 inline-flex">
                  Pay {formatCents(c.amount - c.fromDepositAmount)}
                </a>
              )}
            </div>
          ))}
          <p className="text-xs text-ink/50 mt-3">Questions about this? Send us a message below.</p>
        </div>
      )}

      {SITE.paymentsEnabled && booking.cardRequestedAt && !booking.stripePaymentMethodId && booking.status !== "CANCELLED" && (
        <div className="ledger-card p-5 mt-8 text-left text-sm">
          <p className="font-medium mb-1">Card on file requested</p>
          <p className="text-ink/60 mb-3">
            Nothing is charged now. Under Section 5 of our Terms it&apos;s only used for documented damages, with notice and photos first.
          </p>
          <a href={`/api/bookings/${booking.id}/save-card?t=${booking.messageToken}`} className="btn-secondary inline-flex">
            Save a card securely
          </a>
        </div>
      )}

      {booking.messageToken && <GuestMessages bookingId={booking.id} messageToken={booking.messageToken} />}

      <Link href="/" className="btn-secondary mt-10 inline-flex">Back to all stays</Link>
    </div>
  );
}
