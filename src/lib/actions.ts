"use server";

import { prisma } from "./prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { syncIcalSource as syncIcalSourceLib } from "./ical";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createProperty(formData: FormData) {
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
      )
    }
  });

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/admin/properties");
  revalidatePath("/");
}

export async function deleteProperty(propertyId: string) {
  await prisma.booking.deleteMany({ where: { propertyId } });
  await prisma.blockedDate.deleteMany({ where: { propertyId } });
  await prisma.priceRule.deleteMany({ where: { propertyId } });
  await prisma.icalSource.deleteMany({ where: { propertyId } });
  await prisma.property.delete({ where: { id: propertyId } });
  revalidatePath("/admin/properties");
  revalidatePath("/");
  redirect("/admin/properties");
}

export async function updateBookingStatus(bookingId: string, status: "CONFIRMED" | "CANCELLED") {
  await prisma.booking.update({ where: { id: bookingId }, data: { status } });
  revalidatePath("/admin/bookings");
}

export async function addBlockedDate(propertyId: string, formData: FormData) {
  const date = new Date(String(formData.get("date")));
  await prisma.blockedDate.upsert({
    where: { propertyId_date_source: { propertyId, date, source: "manual" } },
    create: { propertyId, date, source: "manual" },
    update: {}
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function removeBlockedDate(propertyId: string, blockedDateId: string) {
  await prisma.blockedDate.delete({ where: { id: blockedDateId } });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function addIcalSource(propertyId: string, formData: FormData) {
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
  await syncIcalSourceLib(sourceId);
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function addPriceRule(propertyId: string, formData: FormData) {
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
  await prisma.priceRule.delete({ where: { id: ruleId } });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function logoutAction() {
  const { clearAdminSession } = await import("./auth");
  await clearAdminSession();
  redirect("/admin/login");
}

export async function toggleSmartPricing(propertyId: string, formData: FormData) {
  const enabled = formData.get("enabled") === "true";
  await prisma.property.update({
    where: { id: propertyId },
    data: { smartPricingEnabled: enabled }
  });
  revalidatePath(`/admin/properties/${propertyId}`);
}

export async function addSmartPricingRule(propertyId: string, formData: FormData) {
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
  await prisma.smartPricingRule.delete({ where: { id: ruleId } });
  revalidatePath(`/admin/properties/${propertyId}`);
}
