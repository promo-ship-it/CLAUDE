import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HouseRulesPage({ params }: { params: { slug: string } }) {
  const property = await prisma.property.findUnique({ where: { slug: params.slug } });
  if (!property || !property.active) notFound();

  const hasRules = property.houseRules && property.houseRules.trim().length > 0;

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link href={`/properties/${property.slug}`} className="text-sm text-ink/50 hover:text-ink mb-4 inline-block">
        ← Back to {property.name}
      </Link>
      <p className="label-eyebrow mb-3">House Rules</p>
      <h1 className="text-3xl md:text-4xl mb-2">{property.name}</h1>
      <p className="text-ink/60 mb-10">{property.city}, {property.state}</p>

      {hasRules ? (
        <div className="prose prose-sm text-ink/80 whitespace-pre-line leading-relaxed">
          {property.houseRules}
        </div>
      ) : (
        <div className="ledger-card p-8 text-center">
          <p className="text-ink/50">House rules for this property haven't been added yet.</p>
          <p className="text-sm text-ink/40 mt-2">Please contact us if you have questions about your stay.</p>
        </div>
      )}

      <div className="rule mt-12 pt-8">
        <h2 className="text-lg font-display mb-4">General Rules (All Properties)</h2>
        <ul className="space-y-3 text-sm text-ink/70">
          <li>No smoking inside the property. A $500 cleaning surcharge applies if evidence of smoking is found.</li>
          <li>No parties or events without prior written approval from the host.</li>
          <li>Quiet hours: 10:00 PM – 8:00 AM.</li>
          <li>Maximum occupancy must not be exceeded. Only registered guests may stay overnight.</li>
          <li>No unauthorized pets. A $250 cleaning surcharge applies for unauthorized animals.</li>
          <li>Please leave the property in reasonable condition — dishes washed, trash in bins, linens on beds.</li>
          <li>Report any damage or maintenance issues immediately via the messaging system.</li>
          <li>Lock all doors and windows when leaving the property.</li>
          <li>Guest is responsible for damage beyond normal wear and tear (up to $2,500).</li>
        </ul>
      </div>

      <div className="mt-10">
        <Link href="/terms" className="text-sm text-brick hover:underline">
          View full Terms & Conditions →
        </Link>
      </div>
    </div>
  );
}
