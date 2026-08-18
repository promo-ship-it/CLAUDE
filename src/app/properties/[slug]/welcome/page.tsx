import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WelcomePage({ params }: { params: { slug: string } }) {
  const property = await prisma.property.findUnique({ where: { slug: params.slug } });
  if (!property || !property.active) notFound();

  const hasGuide = property.welcomeGuide && property.welcomeGuide.trim().length > 0;

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link href={`/properties/${property.slug}`} className="text-sm text-ink/50 hover:text-ink mb-4 inline-block">
        ← Back to {property.name}
      </Link>
      <p className="label-eyebrow mb-3">Local Guide</p>
      <h1 className="text-3xl md:text-4xl mb-2">Welcome to {property.city}</h1>
      <p className="text-ink/60 mb-10">
        Our favorite spots and tips for your stay at {property.name}.
      </p>

      {hasGuide ? (
        <div className="prose prose-sm text-ink/80 whitespace-pre-line leading-relaxed">
          {property.welcomeGuide}
        </div>
      ) : (
        <div className="ledger-card p-8 text-center">
          <p className="text-ink/50">The local guide for this property hasn't been added yet.</p>
          <p className="text-sm text-ink/40 mt-2">Check back closer to your stay — we'll have recommendations ready for you.</p>
        </div>
      )}

      <div className="rule mt-12 pt-8">
        <h2 className="text-lg font-display mb-4">Quick Reference</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="ledger-card p-4">
            <h3 className="text-sm font-medium mb-2">Property Address</h3>
            <p className="text-sm text-ink/60">{property.address}</p>
            <p className="text-sm text-ink/60">{property.city}, {property.state}</p>
          </div>
          <div className="ledger-card p-4">
            <h3 className="text-sm font-medium mb-2">Check-In / Check-Out</h3>
            <p className="text-sm text-ink/60">Check-in: 3:00 PM</p>
            <p className="text-sm text-ink/60">Check-out: 11:00 AM</p>
          </div>
          <div className="ledger-card p-4">
            <h3 className="text-sm font-medium mb-2">Emergency</h3>
            <p className="text-sm text-ink/60">Emergency: 911</p>
            <p className="text-sm text-ink/60">Non-emergency: Contact host via messages</p>
          </div>
          <div className="ledger-card p-4">
            <h3 className="text-sm font-medium mb-2">WiFi</h3>
            <p className="text-sm text-ink/60">Network & password provided at check-in</p>
          </div>
        </div>
      </div>

      <div className="mt-10 flex gap-6">
        <Link href={`/properties/${property.slug}/house-rules`} className="text-sm text-brick hover:underline">
          House Rules →
        </Link>
        <Link href={`/properties/${property.slug}`} className="text-sm text-brick hover:underline">
          Property Details →
        </Link>
      </div>
    </div>
  );
}
