import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthed } from "@/lib/auth";
import { placeDepositHold, releaseDepositHold } from "@/lib/deposits";

const schema = z.object({ action: z.enum(["release", "retry"]) });

// POST /api/admin/bookings/:id/deposit { action } — host releases the security
// hold early, or retries a hold that failed (after the guest saved a new card).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await props.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    if (parsed.data.action === "release") {
      const ok = await releaseDepositHold(id, "Released early by the host.");
      return ok
        ? NextResponse.json({ result: "RELEASED" })
        : NextResponse.json({ error: "There's no active hold to release." }, { status: 400 });
    }
    const r = await placeDepositHold(id, "place");
    if (r === "SKIPPED") return NextResponse.json({ error: "The hold isn't in a state that can be retried." }, { status: 400 });
    return NextResponse.json({ result: r });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Stripe didn't respond as expected. Try again in a few minutes." }, { status: 500 });
  }
}
