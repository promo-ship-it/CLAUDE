import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { updateBookingStatus } from "@/lib/actions";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: { property: true }
  });

  return (
    <div>
      <h1 className="text-2xl mb-8">Bookings ({bookings.length})</h1>

      <div className="ledger-card divide-y divide-line">
        {bookings.length === 0 && <p className="p-5 text-sm text-ink/50">No bookings yet.</p>}
        {bookings.map((b) => (
          <div key={b.id} className="p-4 flex items-center justify-between gap-4 text-sm">
            <div className="flex-1">
              <p className="font-medium">
                {b.property.name} — {b.guestName}
              </p>
              <p className="text-ink/60">
                {b.guestEmail} · {format(b.checkIn, "MMM d")} → {format(b.checkOut, "MMM d, yyyy")}{" "}
                · {b.guests} guests
              </p>
              {b.notes && <p className="text-ink/50 italic mt-1">"{b.notes}"</p>}
            </div>
            <div className="text-right">
              <p className="font-mono">{formatCents(b.total)}</p>
              <p className="text-xs text-ink/40 font-mono">
                {b.paymentType === "STRIPE" ? "paid online" : "request to book"}
              </p>
            </div>
            <div className="flex flex-col gap-1 items-end w-32">
              <span
                className={`text-xs px-2 py-1 rounded-card ${
                  b.status === "CONFIRMED"
                    ? "bg-sage/20 text-sage"
                    : b.status === "PENDING"
                      ? "bg-brick/10 text-brick"
                      : "bg-line text-ink/50"
                }`}
              >
                {b.status}
              </span>
              {b.status === "PENDING" && (
                <div className="flex gap-2 mt-1">
                  <form action={updateBookingStatus.bind(null, b.id, "CONFIRMED")}>
                    <button className="text-xs text-sage hover:underline">Confirm</button>
                  </form>
                  <form action={updateBookingStatus.bind(null, b.id, "CANCELLED")}>
                    <button className="text-xs text-brick hover:underline">Decline</button>
                  </form>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
