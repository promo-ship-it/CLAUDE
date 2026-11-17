import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/auth";
import { createDamageClaim, DamageError } from "@/lib/damages";

const schema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().positive(), // dollars
  description: z.string().max(4000),
  photoUrls: z.array(z.string()).max(30)
});

// POST /api/admin/damage-claims — file a claim and email the guest the notice.
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid claim details" }, { status: 400 });
  try {
    const claim = await createDamageClaim({
      bookingId: parsed.data.bookingId,
      amountCents: Math.round(parsed.data.amount * 100),
      description: parsed.data.description,
      photoUrls: parsed.data.photoUrls
    });
    return NextResponse.json({ claimId: claim.id, chargeAfter: claim.chargeAfter });
  } catch (err) {
    if (err instanceof DamageError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
