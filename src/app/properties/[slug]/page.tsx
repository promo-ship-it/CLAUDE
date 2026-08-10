import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { notFound } from "next/navigation";
import Image from "next/image";
import BookingWidget from "@/components/BookingWidget";
import PropertyCalendar from "@/components/PropertyCalendar";

export const dynamic = "force-dynamic";

export default async function PropertyPage({ params }: { params: { slug: string } }) {
  const property = await prisma.property.findUnique({ where: { slug: params.slug } });
  if (!property || !property.active) notFound();

  const images: string[] = JSON.parse(property.images || "[]");
  const amenities: string[] = JSON.parse(property.amenities || "[]");

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <p className="label-eyebrow mb-3">
        {property.city}, {property.state}
      </p>
      <h1 className="text-3xl md:text-5xl mb-2">{property.name}</h1>
      <p className="text-ink/60 mb-8">{property.tagline}</p>

      <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[420px] mb-12 rounded-card overflow-hidden">
        {images.slice(0, 5).map((src, i) => (
          <div
            key={i}
            className={`relative bg-line ${i === 0 ? "col-span-2 row-span-2" : "col-span-1 row-span-1"}`}
          >
            <Image src={src} alt={`${property.name} photo ${i + 1}`} fill className="object-cover" />
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-16">
        <div className="md:col-span-2">
          <div className="flex gap-8 pb-8 rule text-sm font-mono">
            <span>{property.maxGuests} guests</span>
            <span>{property.bedrooms} bedrooms</span>
            <span>{property.beds} beds</span>
            <span>{property.baths} baths</span>
          </div>

          <div className="py-8 rule">
            <h2 className="text-xl mb-3">About this stay</h2>
            <p className="text-ink/70 leading-relaxed whitespace-pre-line">{property.description}</p>
          </div>

          <div className="py-8 rule">
            <h2 className="text-xl mb-4">Amenities</h2>
            <div className="grid grid-cols-2 gap-y-2 text-sm text-ink/70">
              {amenities.map((a) => (
                <div key={a}>— {a}</div>
              ))}
            </div>
          </div>

          <div className="py-8 rule">
            <h2 className="text-xl mb-4">Availability</h2>
            <PropertyCalendar
              propertySlug={property.slug}
              minNights={property.minNights}
              maxGuests={property.maxGuests}
            />
          </div>
        </div>

        <div>
          <div className="sticky top-24">
            <p className="font-mono text-lg mb-1">
              {formatCents(property.basePrice)} <span className="text-ink/50 text-sm">/ night</span>
            </p>
            <BookingWidget
              propertySlug={property.slug}
              minNights={property.minNights}
              maxGuests={property.maxGuests}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
