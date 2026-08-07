import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PropertyForm from "@/components/PropertyForm";
import {
  updateProperty,
  deleteProperty,
  addBlockedDate,
  removeBlockedDate,
  addIcalSource,
  syncIcalSourceAction,
  addPriceRule,
  removePriceRule
} from "@/lib/actions";
import { format } from "date-fns";
import { SITE } from "@/lib/config";
import { formatCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({ params }: { params: { id: string } }) {
  const property = await prisma.property.findUnique({ where: { id: params.id } });
  if (!property) notFound();

  const [blockedDates, icalSources, priceRules] = await Promise.all([
    prisma.blockedDate.findMany({
      where: { propertyId: property.id },
      orderBy: { date: "asc" }
    }),
    prisma.icalSource.findMany({ where: { propertyId: property.id } }),
    prisma.priceRule.findMany({ where: { propertyId: property.id }, orderBy: { startDate: "asc" } })
  ]);

  const updateWithId = updateProperty.bind(null, property.id);
  const deleteWithId = deleteProperty.bind(null, property.id);
  const addBlockedWithId = addBlockedDate.bind(null, property.id);
  const addIcalWithId = addIcalSource.bind(null, property.id);
  const addPriceRuleWithId = addPriceRule.bind(null, property.id);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl mb-8">{property.name}</h1>

      <PropertyForm property={property} action={updateWithId} isNew={false} />

      <div className="rule mt-12 pt-10">
        <h2 className="text-xl mb-4">Calendar sync</h2>
        <p className="text-sm text-ink/60 mb-4">
          Export this property's booked dates to Airbnb/VRBO by pasting this URL into their
          "import calendar" field:
        </p>
        <code className="block bg-sand text-xs p-3 rounded-card mb-6 break-all">
          {SITE.url}/api/ical/{property.slug}
        </code>

        <p className="text-sm text-ink/60 mb-3">
          Import their calendars here so this site never shows a date as available that's booked
          elsewhere:
        </p>
        <div className="space-y-2 mb-4">
          {icalSources.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm ledger-card p-3">
              <div>
                <p className="font-medium">{s.label}</p>
                <p className="text-ink/50 text-xs">
                  {s.lastSyncAt ? `Last synced ${format(s.lastSyncAt, "MMM d, h:mma")}` : "Never synced"}
                </p>
              </div>
              <form action={syncIcalSourceAction.bind(null, property.id, s.id)}>
                <button className="text-brick text-xs">Sync now</button>
              </form>
            </div>
          ))}
        </div>
        <form action={addIcalWithId} className="flex gap-2">
          <input name="label" placeholder="Airbnb" className="input w-32" />
          <input name="url" placeholder="https://...ics" required className="input flex-1" />
          <button className="btn-secondary text-sm px-4">Add</button>
        </form>
      </div>

      <div className="rule mt-12 pt-10">
        <h2 className="text-xl mb-4">Seasonal pricing</h2>
        <p className="text-sm text-ink/60 mb-4">
          Override the nightly rate for specific date ranges (e.g. holiday weeks, summer peak).
          Ranges take priority over the base rate; if two ranges overlap, the first match wins.
          End date is exclusive — the night of the end date itself is not included (same as a
          checkout date).
        </p>
        <div className="space-y-2 mb-4">
          {priceRules.length === 0 && (
            <p className="text-sm text-ink/40">No seasonal overrides yet — using the base rate year-round.</p>
          )}
          {priceRules.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm ledger-card p-3">
              <div>
                <p className="font-medium">
                  {r.label || "Seasonal rate"} — {formatCents(r.price)}/night
                </p>
                <p className="text-ink/50 text-xs">
                  {format(r.startDate, "MMM d, yyyy")} → {format(r.endDate, "MMM d, yyyy")}
                </p>
              </div>
              <form action={removePriceRule.bind(null, property.id, r.id)}>
                <button className="text-brick text-xs">Remove</button>
              </form>
            </div>
          ))}
        </div>
        <form action={addPriceRuleWithId} className="grid grid-cols-4 gap-2 items-end">
          <div>
            <label className="block text-xs text-ink/50 mb-1">Start date</label>
            <input type="date" name="startDate" required className="input" />
          </div>
          <div>
            <label className="block text-xs text-ink/50 mb-1">End date</label>
            <input type="date" name="endDate" required className="input" />
          </div>
          <div>
            <label className="block text-xs text-ink/50 mb-1">Rate/night ($)</label>
            <input type="number" step="0.01" name="price" required className="input" />
          </div>
          <div className="flex gap-2">
            <input name="label" placeholder="Label (optional)" className="input" />
            <button className="btn-secondary text-sm px-4 whitespace-nowrap">Add</button>
          </div>
        </form>
      </div>

      <div className="rule mt-12 pt-10">
        <h2 className="text-xl mb-4">Manually block dates</h2>
        <p className="text-sm text-ink/60 mb-4">
          For maintenance, personal use, or anything not already covered by a booking.
        </p>
        <form action={addBlockedWithId} className="flex gap-2 mb-6">
          <input type="date" name="date" required className="input w-48" />
          <button className="btn-secondary text-sm px-4">Block date</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {blockedDates
            .filter((b) => b.source === "manual")
            .map((b) => (
              <form key={b.id} action={removeBlockedDate.bind(null, property.id, b.id)}>
                <button className="text-xs bg-sand px-3 py-1.5 rounded-card hover:bg-line">
                  {format(b.date, "MMM d, yyyy")} ×
                </button>
              </form>
            ))}
        </div>
      </div>

      <div className="rule mt-12 pt-10 pb-16">
        <h2 className="text-xl mb-4 text-brick">Danger zone</h2>
        <form action={deleteWithId}>
          <button className="btn-secondary border-brick text-brick hover:bg-brick hover:text-paper text-sm">
            Delete this property permanently
          </button>
        </form>
      </div>
    </div>
  );
}
