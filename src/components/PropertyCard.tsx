import Link from "next/link";
import Image from "next/image";
import type { Property } from "@prisma/client";
import { formatCents } from "@/lib/pricing";

export default function PropertyCard({ property, index }: { property: Property; index: number }) {
  const images: string[] = JSON.parse(property.images || "[]");
  const cover = images[0] || "/images/placeholder.svg";
  const num = String(index + 1).padStart(2, "0");

  return (
    <Link href={`/properties/${property.slug}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-line">
        <Image
          src={cover}
          alt={property.name}
          fill
          className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
        <span className="absolute top-3 left-3 bg-paper/90 text-ink text-xs font-mono px-2 py-1 rounded">
          {num}
        </span>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-display">{property.name}</h3>
          <p className="text-sm text-ink/60">
            {property.city}, {property.state}
          </p>
        </div>
        <p className="font-mono text-sm text-right whitespace-nowrap">
          {formatCents(property.basePrice)}
          <span className="text-ink/50"> /night</span>
        </p>
      </div>
    </Link>
  );
}
