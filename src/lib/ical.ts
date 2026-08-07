import ICAL from "ical.js";
import { createEvents, type EventAttributes } from "ics";
import { prisma } from "./prisma";
import { nightsBetween } from "./pricing";

/**
 * Build an .ics feed of booked/blocked dates for one property, so it can
 * be pasted into Airbnb/VRBO's "import calendar" field to keep them in sync.
 */
export async function buildIcalFeed(propertyId: string): Promise<string> {
  const [bookings, blocked, property] = await Promise.all([
    prisma.booking.findMany({
      where: { propertyId, status: { in: ["PENDING", "CONFIRMED"] } }
    }),
    prisma.blockedDate.findMany({ where: { propertyId } }),
    prisma.property.findUniqueOrThrow({ where: { id: propertyId } })
  ]);

  const events: EventAttributes[] = bookings.map((b) => ({
    title: `Booked — ${property.name}`,
    start: dateToArr(b.checkIn),
    end: dateToArr(b.checkOut),
    uid: `${b.id}@direct-booking`
  }));

  for (const b of blocked) {
    events.push({
      title: `Blocked — ${property.name}`,
      start: dateToArr(b.date),
      end: dateToArr(new Date(b.date.getTime() + 86400000)),
      uid: `${b.id}@direct-booking`
    });
  }

  const { error, value } = createEvents(events);
  if (error) throw error;
  return value || "";
}

function dateToArr(d: Date): [number, number, number] {
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

/**
 * Fetch an external .ics URL (e.g. from Airbnb) and write its booked dates
 * into BlockedDate rows for the property, tagged with the source label, so
 * the site never shows a date as available that's booked on another channel.
 * Call this on a schedule (cron / admin "Sync now" button).
 */
export async function syncIcalSource(sourceId: string): Promise<{ imported: number }> {
  const source = await prisma.icalSource.findUniqueOrThrow({ where: { id: sourceId } });
  const res = await fetch(source.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch calendar: ${res.status}`);
  const text = await res.text();

  const jcalData = ICAL.parse(text);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents("vevent");

  // Clear previous dates from this source, then re-import fresh
  await prisma.blockedDate.deleteMany({
    where: { propertyId: source.propertyId, source: source.label }
  });

  let imported = 0;
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const start = event.startDate.toJSDate();
    const end = event.endDate.toJSDate();
    for (const night of nightsBetween(start, end)) {
      await prisma.blockedDate.upsert({
        where: {
          propertyId_date_source: {
            propertyId: source.propertyId,
            date: night,
            source: source.label
          }
        },
        create: { propertyId: source.propertyId, date: night, source: source.label },
        update: {}
      });
      imported++;
    }
  }

  await prisma.icalSource.update({
    where: { id: sourceId },
    data: { lastSyncAt: new Date() }
  });

  return { imported };
}
