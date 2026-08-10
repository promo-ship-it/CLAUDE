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
  removePriceRule,
  toggleSmartPricing,
  addSmartPricingRule,
  removeSmartPricingRule
} from "@/lib/actions";
import { format } from "date-fns";
import { SITE } from "@/lib/config";
import { formatCents } from "@/lib/format";

export const dynamic = "force-dynamic";

const RULE_TYPE_LABELS: Record<string, string> = {
  DAY_OF_WEEK: "Day of week",
  LAST_MINUTE: "Last minute",
  FAR_OUT: "Far-out booking",
  HIGH_DEMAND: "High demand",
  LOW_DEMAND: "Low demand"
};

const RULE_TYPE_DESCRIPTIONS: Record<string, string> = {
  DAY_OF_WEEK: "Adjust price on specific days (0=Sun, 1=Mon, …, 5=Fri, 6=Sat). Threshold: comma-separated day numbers.",
  LAST_MINUTE: "Adjust when booking is within X days of check-in. Threshold: number of days.",
  FAR_OUT: "Adjust when booking is X+ days in advance. Threshold: minimum days ahead.",
  HIGH_DEMAND: "Adjust when monthly occupancy exceeds X%. Threshold: percentage.",
  LOW_DEMAND: "Adjust when monthly occupancy is below X%. Threshold: percentage."
};

export default async function EditPropertyPage({ params }: { params: { id: string } }) {
  const property = await prisma.property.findUnique({ where: { id: params.id } });
  if (!property) notFound();

  const [blockedDates, icalSources, priceRules, smartPricingRules] = await Promise.all([
    prisma.blockedDate.findMany({
      where: { propertyId: property.id },
      orderBy: { date: "asc" }
    }),
    prisma.icalSource.findMany({ where: { propertyId: property.id } }),
    prisma.priceRule.findMany({ where: { propertyId: property.id }, orderBy: { startDate: "asc" } }),
    prisma.smartPricingRule.findMany({ where: { propertyId: property.id }, orderBy: { createdAt: "asc" } })
  ]);

  const updateWithId = updateProperty.bind(null, property.id);
  const deleteWithId = deleteProperty.bind(null, property.id);
  const addBlockedWithId = addBlockedDate.bind(null, property.id);
  const addIcalWithId = addIcalSource.bind(null, property.id);
  const addPriceRuleWithId = addPriceRule.bind(null, property.id);
  const addSmartRuleWithId = addSmartPricingRule.bind(null, property.id);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl mb-8">{property.name}</h1>

      <PropertyForm property={property} action={updateWithId} isNew={false} />

      {/* Smart Pricing Section */}
      <div className="rule mt-12 pt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl">Smart pricing</h2>
          <form action={toggleSmartPricing.bind(null, property.id)}>
            <input type="hidden" name="enabled" value={property.smartPricingEnabled ? "false" : "true"} />
            <button className={`text-xs px-3 py-1.5 rounded-card ${
              property.smartPricingEnabled
                ? "bg-sage/20 text-sage"
                : "bg-line text-ink/50"
            }`}>
              {property.smartPricingEnabled ? "Enabled ✓" : "Disabled — click to enable"}
            </button>
          </form>
        </div>
        <p className="text-sm text-ink/60 mb-4">
          Automatically adjust nightly rates based on demand signals. Rules stack —
          a weekend night during high-demand could get both adjustments applied.
          Total adjustment is capped at -50% to +100%.
        </p>

        <div className="space-y-2 mb-6">
          {smartPricingRules.length === 0 && (
            <p className="text-sm text-ink/40">No smart pricing rules yet — add one below.</p>
          )}
          {smartPricingRules.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm ledger-card p-3">
              <div>
                <p className="font-medium">
                  {RULE_TYPE_LABELS[r.ruleType] || r.ruleType}{" "}
                  <span className={`font-mono ${r.adjustment > 0 ? "text-brick" : "text-sage"}`}>
                    {r.adjustment > 0 ? "+" : ""}{r.adjustment}%
                  </span>
                </p>
                <p className="text-ink/50 text-xs">
                  Threshold: {r.threshold || "default"} · {r.active ? "Active" : "Inactive"}
                </p>
              </div>
              <form action={removeSmartPricingRule.bind(null, property.id, r.id)}>
                <button className="text-brick text-xs">Remove</button>
              </form>
            </div>
          ))}
        </div>

        <form action={addSmartRuleWithId} className="ledger-card p-4 space-y-3">
          <p className="text-xs font-medium text-ink/70">Add a smart pricing rule</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-ink/50 mb-1">Rule type</label>
              <select name="ruleType" required className="input text-xs">
                <option value="">Select…</option>
                <option value="DAY_OF_WEEK">Day of week (weekend)</option>
                <option value="LAST_MINUTE">Last minute</option>
                <option value="FAR_OUT">Far-out booking</option>
                <option value="HIGH_DEMAND">High demand</option>
                <option value="LOW_DEMAND">Low demand</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink/50 mb-1">Threshold</label>
              <input name="threshold" placeholder="e.g. 5,6 or 70" className="input text-xs" />
            </div>
            <div>
              <label className="block text-xs text-ink/50 mb-1">Adjustment (%)</label>
              <input type="number" name="adjustment" required placeholder="+20 or -15" className="input text-xs" />
            </div>
          </div>
          <div className="text-xs text-ink/40 space-y-1">
            <p><strong>Day of week:</strong> threshold = day numbers (0=Sun, 5=Fri, 6=Sat). Default: "5,6"</p>
            <p><strong>Last minute:</strong> threshold = days until check-in. Default: 7</p>
            <p><strong>Far-out:</strong> threshold = min days ahead. Default: 60</p>
            <p><strong>High/Low demand:</strong> threshold = occupancy %. Default: 70 / 30</p>
          </div>
          <button className="btn-secondary text-sm px-4">Add rule</button>
        </form>
      </div>

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
