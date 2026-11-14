"use server";

import { prisma } from "./prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { syncIcalSource as syncIcalSourceLib } from "./ical";
import { isAdminAuthed } from "./auth";
import { notifyBooking } from "./notify";
import { sendCancellationEmails } from "./email";

// Server actions can be invoked directly over HTTP, so every admin action
// checks the session itself rather than relying only on the middleware.
async function requireAdmin() {
  if (!(await isAdminAuthed())) throw new Error("Not authorized");
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createProperty(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name"));
  const slug = slugify(String(formData.get("slug") || name));

  await prisma.property.create({
    data: {
      name,
      slug,
      tagline: String(formData.get("tagline") || ""),
      description: String(formData.get("description") || ""),
      address: String(formData.get("address") || ""),
      city: String(formData.get("city") || ""),
      state: String(formData.get("state") || ""),
      country: String(formData.get("country") || "US"),
      maxGuests: Number(formData.get("maxGuests") || 2),
      bedrooms: Number(formData.get("bedrooms") || 1),
      beds: Number(formData.get("beds") || 1),
      baths: Number(formData.get("baths") || 1),
      basePrice: Math.round(Number(formData.get("basePrice") || 0) * 100),
      cleaningFee: Math.round(Number(formData.get("cleaningFee") || 0) * 100),
      taxRate: Number(formData.get("taxRate") || 0) / 100,
      minNights: Number(formData.get("minNights") || 2),
      minPrice: formData.get("minPrice") ? Math.round(Number(formData.get("minPrice")) * 100) : null,
      maxPrice: formData.get("maxPrice") ? Math.round(Number(formData.get("maxPrice")) * 100) : null,
      amenities: JSON.stringify(
        String(formData.get("amenities") || "")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      ),
      images: JSON.stringify(
        String(formData.get("images") || "")
          .split("\n")
          .map((a) => a.trim())
          .filter(Boolean)
      )
    }
  });

  revalidatePath("/admin/properties");
  revalidatePath("/");
  redirect("/admin/properties");
}

export async function updateProperty(propertyId: string, formData: FormData) {
  await requireAdmin();
  await prisma.property.update({
    where: { id: propertyId },
    data: {
      name: String(formData.get("name")),
      tagline: String(formData.get("tagline") || ""),
      description: String(formData.get("description") || ""),
      address: String(formData.get("address") || ""),
      city: String(formData.get("city") || ""),
      state: String(formData.get("state") || ""),
      country: String(formData.get("country") || "US"),
      maxGuests: Number(formData.get("maxGuests") || 2),
      bedrooms: Number(formData.get("bedrooms") || 1),
      beds: Number(formData.get("beds") || 1),
      baths: Number(formData.get("baths") || 1),
      basePrice: Math.round(Number(formData.get("basePrice") || 0) * 100),
      cleaningFee: Math.round(Number(formData.get("cleaningFee") || 0) * 100),
      taxRate: Number(formData.get("taxRate") || 0) / 100,
      minNights: Number(formData.get("minNights") || 2),
      minPrice: formData.get("minPrice") ? Math.round(Number(formData.get("minPrice")) * 100) : null,
      maxPrice: formData.get("maxPrice") ? Math.round(Number(formData.get("maxPrice")) * 100) : null,
      active: formData.get("active") === "on",
      amenities: JSON.stringify(
        String(formData.get("amenities") || "")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      ),
      images: JSON.stringify(
        String(formData.get("images") || "")
          .split("\n")
          .map((a) => a.trim())
          .filter(Boolean)
      ),
      houseRules: String(formData.get("houseRules") || "") || null,
      welcomeGuide: String(formData.get("welcomeGuide") || "") || null
    }
  });

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/admin/properties");
  revalidatePath("/");
}

export async function deleteProperty(propertyId: string) {
  await requireAdmin();
  // Never destroy payment records: properties with paid bookings must be
  // unpublished instead (uncheck "Published" on the property form).
  const paid =
    (await prisma.payment.count({ where: { booking: { propertyId } } })) +
    (await prisma.damageClaim.count({ where: { booking: { propertyId }, status: { in: ["CHARGED", "PAID"] } } }));
  if (paid > 0) {
    throw new Error("This property has paid bookings, so it can't be deleted. Unpublish it instead.");
  }
  const bookingIds = (await prisma.booking.findMany({ where: { propertyId }, select: { id: true } })).map((b) => b.id);
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { bookingId: { in: bookingIds } } }),
    prisma.damageClaim.deleteMany({ where: { bookingId: { in: bookingIds } } }),
    prisma.booking.deleteMany({ where: { propertyId } }),
    prisma.blockedDate.deleteMany({ where: { propertyId } }),
    prisma.priceRule.deleteMany({ where: { propertyId } }),
    prisma.smartPricingRule.deleteMany({ where: { propertyId } }),
    prisma.icalSource.deleteMany({ where: { propertyId } }),
    prisma.property.delete({ where: { id: propertyId } })
  ]);
  revalidatePath("/admin/properties");
  revalidatePath("/");
  redirect("/admin/properties");
}

/** Host confirms or declines a request-to-book inquiry (no payment involved). */
export async function updateBookingStatus(bookingId: string, status: "CONFIRMED" | "CANCELLED") {
  await requireAdmin();
  const updated = await prisma.booking.updateMany({
    where: { id: bookingId, status: "PENDING", paymentType: "INQUIRY" },
    data:
      status === "CONFIRMED"
        ? { status }
        : { status, cancelledAt: new Date(), cancelledBy: "HOST", refundAmount: 0, cancellationNote: "Request declined by the host." }
  });
  if (updated.count === 1) {
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { property: true } });
    if (status === "CONFIRMED") {
      await notifyBooking(booking, booking.property, "CONFIRMED");
    } else {
      await sendCancellationEmails({
        guestEmail: booking.guestEmail,
        guestName: booking.guestName,
        propertyName: booking.property.name,
        checkIn: format(booking.checkIn, "MMM d, yyyy"),
        checkOut: format(booking.checkOut, "MMM d, yyyy"),
        refund: "$0 (no payment was taken)",
        explanation: "Unfortunately we can't host you on these dates.",
        cancelledBy: "HOST"
      });
    }
  }
  revalidatePath("/admin/bookings");
}

export async function addBlockedDate(propertyId: string, formData: FormData) {
  await requireAdmin();
  const date = new Date(String(formData.get("date")));
  await prisma.blockedDate.upsert({
    where: { propertyId_date_source: { propertyId, date, source: "manual" } },
    create: { propertyId, date, source: "manual" },
    update: {}
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function removeBlockedDate(propertyId: string, blockedDateId: string) {
  await requireAdmin();
  await prisma.blockedDate.delete({ where: { id: blockedDateId } });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function addIcalSource(propertyId: string, formData: FormData) {
  await requireAdmin();
  await prisma.icalSource.create({
    data: {
      propertyId,
      label: String(formData.get("label") || "External"),
      url: String(formData.get("url"))
    }
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function syncIcalSourceAction(propertyId: string, sourceId: string) {
  await requireAdmin();
  await syncIcalSourceLib(sourceId);
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function addPriceRule(propertyId: string, formData: FormData) {
  await requireAdmin();
  const startDate = new Date(String(formData.get("startDate")));
  const endDate = new Date(String(formData.get("endDate")));
  const price = Math.round(Number(formData.get("price") || 0) * 100);
  const label = String(formData.get("label") || "");

  if (endDate <= startDate) return; // silently ignore an invalid range

  await prisma.priceRule.create({
    data: { propertyId, startDate, endDate, price, label: label || null }
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function removePriceRule(propertyId: string, ruleId: string) {
  await requireAdmin();
  await prisma.priceRule.delete({ where: { id: ruleId } });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function logoutAction() {
  const { clearAdminSession } = await import("./auth");
  await clearAdminSession();
  redirect("/admin/login");
}

export async function toggleSmartPricing(propertyId: string, formData: FormData) {
  await requireAdmin();
  const enabled = formData.get("enabled") === "true";
  await prisma.property.update({
    where: { id: propertyId },
    data: { smartPricingEnabled: enabled }
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function addSmartPricingRule(propertyId: string, formData: FormData) {
  await requireAdmin();
  const ruleType = String(formData.get("ruleType"));
  const threshold = String(formData.get("threshold") || "");
  const adjustment = Number(formData.get("adjustment") || 0);

  if (!ruleType || adjustment === 0) return;

  await prisma.smartPricingRule.create({
    data: {
      propertyId,
      ruleType: ruleType as any,
      threshold: threshold || null,
      adjustment
    }
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function removeSmartPricingRule(propertyId: string, ruleId: string) {
  await requireAdmin();
  await prisma.smartPricingRule.delete({ where: { id: ruleId } });
  revalidatePath(`/admin/properties/${propertyId}`);
}
