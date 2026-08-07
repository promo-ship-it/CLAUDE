import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.property.count();
  if (existing > 0) {
    console.log("Properties already exist — skipping seed. Delete dev.db to reset.");
    return;
  }

  await prisma.property.create({
    data: {
      slug: "lakeside-cabin",
      name: "Lakeside Cabin",
      tagline: "A quiet cabin on the water, ten minutes from town",
      description:
        "A one-bedroom cabin set right on the shoreline, with a private dock, wood stove, and a wraparound porch for morning coffee. Kayaks included.\n\nQuiet, dark-sky nights and a five-minute walk to the general store.",
      address: "142 Shoreline Rd",
      city: "Ellison Bay",
      state: "WI",
      country: "US",
      maxGuests: 4,
      bedrooms: 1,
      beds: 2,
      baths: 1,
      basePrice: 21500,
      cleaningFee: 8500,
      taxRate: 0.055,
      minNights: 2,
      amenities: JSON.stringify([
        "WiFi",
        "Kitchen",
        "Wood stove",
        "Private dock",
        "Free parking",
        "Kayaks included",
        "Washer/dryer",
        "Fire pit"
      ]),
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?w=1200",
        "https://images.unsplash.com/photo-1499696010180-025ef6e1a8f9?w=1200",
        "https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1200"
      ])
    }
  });

  await prisma.property.create({
    data: {
      slug: "downtown-loft",
      name: "Downtown Loft",
      tagline: "Exposed brick, big windows, walk to everything",
      description:
        "A sunny 2-bedroom loft above the old mill, a block from the best coffee in town. High ceilings, original brick, and a rooftop shared with just two other units.",
      address: "88 Mill St, Unit 4",
      city: "Asheville",
      state: "NC",
      country: "US",
      maxGuests: 5,
      bedrooms: 2,
      beds: 3,
      baths: 1.5,
      basePrice: 18900,
      cleaningFee: 9500,
      taxRate: 0.075,
      minNights: 3,
      amenities: JSON.stringify([
        "WiFi",
        "Kitchen",
        "Rooftop access",
        "Washer/dryer",
        "Workspace",
        "Air conditioning",
        "Elevator"
      ]),
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200",
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200",
        "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200"
      ])
    }
  });

  console.log("Seeded 2 sample properties. Edit or delete them from /admin/properties.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
