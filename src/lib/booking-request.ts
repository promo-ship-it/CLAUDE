import { z } from "zod";

/** Body accepted by POST /api/bookings and POST /api/checkout. */
export const bookingRequestSchema = z.object({
  slug: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7, "Phone number is required").max(40),
  notes: z.string().max(2000).optional(),
  plan: z.enum(["STANDARD", "NON_REFUNDABLE"]).default("STANDARD"),
  acceptedTerms: z.literal(true, { message: "You must accept the Terms & Conditions." }),
  acceptedNonRefundable: z.boolean().optional(),
  authorizeRecurring: z.boolean().optional()
});

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export function firstIssue(err: z.ZodError) {
  return err.issues[0]?.message || "Invalid booking details";
}
