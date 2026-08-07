import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { format } from "date-fns";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  searchParams
}: {
  searchParams: { bookingId?: string };
}) {
  const booking = searchParams.bookingId
    ? await prisma.booking.findUnique({
        where: { id: searchParams.bookingId },
        include: { property: true }
      })
    : null;

  if (!booking) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl mb-4">We couldn't find that booking</h1>
        <Link href="/" className="btn-secondary">
          Back home
        </Link>
      </div>
    );
  }

  const confirmed = booking.status === "CONFIRMED";

  return (
    <div className="max-w-xl mx-auto px-6 py-24 text-center">
      <p className="label-eyebrow mb-3">{confirmed ? "Booking confirmed" : "Request received"}</p>
      <h1 className="text-3xl md:text-4xl mb-6">
        {confirmed ? "You're all set." : "We'll be in touch soon."}
      </h1>
      <p className="text-ink/70 mb-10">
        {confirmed
          ? `Your stay at ${booking.property.name} is confirmed.`
          : `We've received your request for ${booking.property.name} and will confirm within 24 hours.`}
      </p>

      <div className="ledger-card p-6 text-left font-mono text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-ink/60">Property</span>
          <span>{booking.property.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink/60">Dates</span>
          <span>
            {format(booking.checkIn, "MMM d")} → {format(booking.checkOut, "MMM d, yyyy")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink/60">Guests</span>
          <span>{booking.guests}</span>
        </div>
        <div className="flex justify-between pt-2 rule font-semibold">
          <span>Total</span>
          <span>{formatCents(booking.total)}</span>
        </div>
      </div>

      <Link href="/" className="btn-secondary mt-10 inline-flex">
        Back to all stays
      </Link>
    </div>
  );
}
