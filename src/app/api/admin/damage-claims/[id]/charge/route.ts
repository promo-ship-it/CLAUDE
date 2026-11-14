import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/auth";
import { chargeDamageClaim, DamageError } from "@/lib/damages";

// POST /api/admin/damage-claims/:id/charge — charge the saved card (after the notice period).
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await props.params;
  try {
    const result = await chargeDamageClaim(id);
    return NextResponse.json({
      outcome: result.outcome,
      reason: result.outcome === "PAYMENT_LINK_SENT" ? result.reason : undefined
    });
  } catch (err) {
    if (err instanceof DamageError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
