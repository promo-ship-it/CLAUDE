import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/auth";
import { DamageError, requestCardOnFile } from "@/lib/damages";

// POST /api/admin/bookings/:id/request-card — email the guest a link to save a card.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await props.params;
  try {
    await requestCardOnFile(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof DamageError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
