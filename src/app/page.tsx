import { prisma } from "@/lib/prisma";
import PropertyCard from "@/components/PropertyCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const properties = await prisma.property.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" }
  });

  return (
    <div>
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20">
        <p className="label-eyebrow mb-4">Book direct — no platform fees</p>
        <h1 className="text-4xl md:text-6xl leading-[1.05] max-w-3xl">
          A handful of stays,
          <br />
          <span className="italic text-brick">looked after properly.</span>
        </h1>
        <p className="mt-6 max-w-xl text-ink/70 text-lg">
          {properties.length} place{properties.length === 1 ? "" : "s"} to stay, each one run by
          us directly — real availability, real prices, no third-party markup.
        </p>
      </section>

      <section id="stays" className="max-w-6xl mx-auto px-6 pb-24">
        <div className="rule mb-10" />
        {properties.length === 0 ? (
          <p className="text-ink/60">
            No stays are published yet. Add a property from the admin dashboard.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
            {properties.map((p, i) => (
              <PropertyCard key={p.id} property={p} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
