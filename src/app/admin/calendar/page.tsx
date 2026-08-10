import { prisma } from "@/lib/prisma";
import { format, startOfMonth, endOfMonth, addMonths } from "date-fns";
import AdminCalendarView from "@/components/AdminCalendarView";

export const dynamic = "force-dynamic";

// Color palette for differentiating properties
const PROPERTY_COLORS = [
  "#A65A3D", // brick
  "#7C8B7A", // sage
  "#4A7C9B", // blue
  "#9B6B9B", // purple
  "#6B9B7C", // teal
  "#C4883D", // amber
  "#5B7BA6", // slate blue
  "#A6785B", // tan
];

export default async function AdminCalendarPage() {
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true }
  });

  // Fetch bookings for a 6-month window
  const rangeStart = startOfMonth(new Date());
  const rangeEnd = endOfMonth(addMonths(rangeStart, 5));

  const [bookings, blockedDates] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        checkOut: { gte: rangeStart },
        checkIn: { lte: rangeEnd }
      },
      include: { property: true },
      orderBy: { checkIn: "asc" }
    }),
    prisma.blockedDate.findMany({
      where: {
        date: { gte: rangeStart, lte: rangeEnd }
      },
      include: { property: true }
    })
  ]);

  // Build calendar event data to pass to client component
  const events = bookings.map((b) => ({
    id: b.id,
    propertyId: b.propertyId,
    propertyName: b.property.name,
    guestName: b.guestName,
    checkIn: b.checkIn.toISOString(),
    checkOut: b.checkOut.toISOString(),
    status: b.status,
    type: "booking" as const
  }));

  const blocks = blockedDates.map((bd) => ({
    id: bd.id,
    propertyId: bd.propertyId,
    propertyName: bd.property.name,
    date: bd.date.toISOString(),
    source: bd.source,
    type: "blocked" as const
  }));

  const propertyColorMap = properties.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: PROPERTY_COLORS[i % PROPERTY_COLORS.length]
  }));

  return (
    <div>
      <h1 className="text-2xl mb-8">Calendar</h1>
      <AdminCalendarView
        events={events}
        blocks={blocks}
        properties={propertyColorMap}
      />
    </div>
  );
}
