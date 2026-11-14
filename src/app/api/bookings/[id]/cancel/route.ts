import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/auth";
import { cancelBooking, CancellationError, previewCancellation } from "@/lib/payments";

// Guests authenticate with the private token from their booking link (?t=...);
// the host authenticates with the admin session cookie.
async function authorize(req: NextRequest, id: string, token: string | null) {
  const booking = await prisma.booking.findUnique({ where: { id }, include: { property: true, payments: true } });
  if (!booking) return { booking: null, actor: null };
  if (await isAdminAuthed()) return { booking, actor: "HOST" as const };
  if (token && booking.messageToken && token === booking.messageToken) return { booking, actor: "GUEST" as const };
  return { booking: null, actor: null };
}

// GET — preview the refund before confirming.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { booking, actor } = await authorize(req, params.id, req.nextUrl.searchParams.get("t"));
  if (!booking || !actor) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  return NextResponse.json({
    actor,
    policy: previewCancellation(booking, false),
    ...(actor === "HOST" ? { hostFullRefund: previewCancellation(booking, true) } : {})
  });
}

const postSchema = z.object({ t: z.string().optional(), hostFullRefund: z.boolean().optional() });

// POST — cancel. Guests always get the policy outcome; the host may choose a full refund.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { booking, actor } = await authorize(req, params.id, body.data.t ?? null);
  if (!booking || !actor) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  try {
    const result = await cancelBooking(booking.id, actor, actor === "HOST" && Boolean(body.data.hostFullRefund));
    return NextResponse.json({ success: true, refunded: result.refunded, explanation: result.explanation, note: result.note });
  } catch (err) {
    if (err instanceof CancellationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Cancellation failed — nothing was changed. Please try again." }, { status: 500 });
  }
}
