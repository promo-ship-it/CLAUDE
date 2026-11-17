import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/auth";
import { cancelDamageClaim, DamageError } from "@/lib/damages";

// POST /api/admin/damage-claims/:id/cancel — withdraw an unpaid claim.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await props.params;
  try {
    await cancelDamageClaim(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof DamageError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
