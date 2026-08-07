import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatCents } from "@/lib/pricing";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [propertyCount, pendingBookings, upcoming] = await Promise.all([
    prisma.property.count(),
    prisma.booking.count({ where: { status: "PENDING" } }),
    prisma.booking.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, checkIn: { gte: new Date() } },
      orderBy: { checkIn: "asc" },
      take: 5,
      include: { property: true }
    })
  ]);

  return (
    <div>
      <h1 className="text-2xl mb-8">Overview</h1>
      <div className="grid sm:grid-cols-3 gap-4 mb-12">
        <div className="ledger-card p-5">
          <p className="text-xs uppercase text-ink/50 mb-1">Properties</p>
          <p className="text-3xl font-display">{propertyCount}</p>
        </div>
        <div className="ledger-card p-5">
          <p className="text-xs uppercase text-ink/50 mb-1">Pending requests</p>
          <p className="text-3xl font-display">{pendingBookings}</p>
        </div>
        <div className="ledger-card p-5">
          <Link href="/admin/properties" className="text-brick text-sm">
            + Add a property →
          </Link>
        </div>
      </div>

      <h2 className="text-lg mb-4">Upcoming stays</h2>
      <div className="ledger-card divide-y divide-line">
        {upcoming.length === 0 && <p className="p-5 text-sm text-ink/50">Nothing booked yet.</p>}
        {upcoming.map((b) => (
          <div key={b.id} className="p-4 flex justify-between items-center text-sm">
            <div>
              <p className="font-medium">{b.property.name}</p>
              <p className="text-ink/60">
                {b.guestName} · {format(b.checkIn, "MMM d")} → {format(b.checkOut, "MMM d")}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono">{formatCents(b.total)}</p>
              <p className={`text-xs ${b.status === "PENDING" ? "text-brick" : "text-sage"}`}>
                {b.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
