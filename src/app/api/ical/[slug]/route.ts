import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildIcalFeed } from "@/lib/ical";

// GET /api/ical/[slug] — paste this URL into Airbnb/VRBO's "import calendar" field
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const property = await prisma.property.findUnique({ where: { slug: params.slug } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const feed = await buildIcalFeed(property.id);
  return new NextResponse(feed, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${property.slug}.ics"`
    }
  });
}
