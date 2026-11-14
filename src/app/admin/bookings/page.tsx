import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { updateBookingStatus } from "@/lib/actions";
import { format } from "date-fns";
import AdminMessages from "@/components/AdminMessages";
import CancelBooking from "@/components/CancelBooking";
import { POLICY_NAMES, PENDING_PAYMENT_HOLD_MINUTES, type RatePlan } from "@/lib/policy";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL = { INQUIRY: "request to book", STRIPE: "paid online", STRIPE_RECURRING: "monthly billing" } as const;

export default async function AdminBookingsPage() {
  await requireAdminPage();
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: { property: true, payments: true, _count: { select: { messages: true } } }
  });
  const holdCutoff = Date.now() - PENDING_PAYMENT_HOLD_MINUTES * 60 * 1000;

  return (
    <div>
      <h1 className="text-2xl mb-8">Bookings ({bookings.length})</h1>

      <div className="ledger-card divide-y divide-line">
        {bookings.length === 0 && <p className="p-5 text-sm text-ink/50">No bookings yet.</p>}
        {bookings.map((b) => {
          const paid = b.payments.filter((p) => p.kind !== "SHORTFALL").reduce((s, p) => s + p.amount, 0);
          const refunded = b.payments.reduce((s, p) => s + p.refundedAmount, 0);
          const installmentsMade = b.payments.filter((p) => p.kind !== "SHORTFALL").length;
          const isRequest = b.status === "PENDING" && b.paymentType === "INQUIRY";
          const awaitingPayment = b.status === "PENDING" && b.paymentType !== "INQUIRY";
          const abandoned = awaitingPayment && b.createdAt.getTime() < holdCutoff;

          return (
            <div key={b.id} className="p-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="font-medium">
                    {b.property.name} — {b.guestName}
                  </p>
                  <p className="text-ink/60">
                    {b.guestEmail}
                    {b.guestPhone ? ` · ${b.guestPhone}` : ""} · {format(b.checkIn, "MMM d")} →{" "}
                    {format(b.checkOut, "MMM d, yyyy")} · {b.guests} guests
                  </p>
                  <p className="text-xs text-ink/50 mt-1">
                    {POLICY_NAMES[b.cancellationPolicy as RatePlan]} policy
                    {b.discountAmount > 0 ? ` · ${b.discountLabel}` : ""}
                    {b.totalPayments ? ` · payments ${installmentsMade}/${b.totalPayments}` : ""}
                  </p>
                  {b.notes && <p className="text-ink/50 italic mt-1">&ldquo;{b.notes}&rdquo;</p>}
                  {b.cancellationNote && <p className="text-xs text-ink/50 mt-1">{b.cancellationNote}</p>}
                </div>
                <div className="text-right">
                  <p className="font-mono">{formatCents(b.total)}</p>
                  <p className="text-xs text-ink/40 font-mono">{PAYMENT_LABEL[b.paymentType]}</p>
                  {paid > 0 && <p className="text-xs text-ink/50 font-mono">paid {formatCents(paid)}</p>}
                  {refunded > 0 && <p className="text-xs text-brick font-mono">refunded {formatCents(refunded)}</p>}
                </div>
                <div className="flex flex-col gap-1 items-end w-40">
                  <span
                    className={`text-xs px-2 py-1 rounded-card ${
                      b.status === "CONFIRMED"
                        ? "bg-sage/20 text-sage"
                        : b.status === "PENDING"
                          ? "bg-brick/10 text-brick"
                          : "bg-line text-ink/50"
                    }`}
                  >
                    {awaitingPayment ? (abandoned ? "UNPAID (released)" : "AWAITING PAYMENT") : b.status}
                  </span>
                  {isRequest && (
                    <div className="flex gap-2 mt-1">
                      <form action={updateBookingStatus.bind(null, b.id, "CONFIRMED")}>
                        <button className="text-xs text-sage hover:underline">Confirm</button>
                      </form>
                      <form action={updateBookingStatus.bind(null, b.id, "CANCELLED")}>
                        <button className="text-xs text-brick hover:underline">Decline</button>
                      </form>
                    </div>
                  )}
                  {b.status === "CONFIRMED" && <CancelBooking bookingId={b.id} admin />}
                  {b._count.messages > 0 && (
                    <span className="text-[10px] text-ink/40 mt-1">
                      {b._count.messages} message{b._count.messages > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <AdminMessages bookingId={b.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
