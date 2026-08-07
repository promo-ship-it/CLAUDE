import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatCents } from "@/lib/pricing";
import { createProperty } from "@/lib/actions";
import PropertyForm from "@/components/PropertyForm";

export const dynamic = "force-dynamic";

export default async function AdminPropertiesPage() {
  const properties = await prisma.property.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div>
      <h1 className="text-2xl mb-8">Properties ({properties.length})</h1>

      <div className="ledger-card divide-y divide-line mb-16">
        {properties.length === 0 && (
          <p className="p-5 text-sm text-ink/50">No properties yet — add your first one below.</p>
        )}
        {properties.map((p) => (
          <Link
            key={p.id}
            href={`/admin/properties/${p.id}`}
            className="p-4 flex justify-between items-center text-sm hover:bg-sand/40"
          >
            <div>
              <p className="font-medium">
                {p.name} {!p.active && <span className="text-ink/40">(unpublished)</span>}
              </p>
              <p className="text-ink/60">
                {p.city}, {p.state} · /{p.slug}
              </p>
            </div>
            <p className="font-mono">{formatCents(p.basePrice)}/night</p>
          </Link>
        ))}
      </div>

      <div className="rule pt-10">
        <h2 className="text-xl mb-6">Add a property</h2>
        <PropertyForm action={createProperty} isNew />
      </div>
    </div>
  );
}
