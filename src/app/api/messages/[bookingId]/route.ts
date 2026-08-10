import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/auth";
import { z } from "zod";

// GET /api/messages/[bookingId]?token=xxx — get messages for a booking
// Accessible by admin (via cookie) or guest (via messageToken query param)
export async function GET(req: NextRequest, { params }: { params: { bookingId: string } }) {
  const authorized = await authorizeAccess(req, params.bookingId);
  if (!authorized) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const messages = await prisma.message.findMany({
    where: { bookingId: params.bookingId },
    orderBy: { createdAt: "asc" }
  });

  return NextResponse.json({ messages });
}

const postSchema = z.object({
  text: z.string().min(1).max(2000),
  sender: z.enum(["GUEST", "HOST"])
});

// POST /api/messages/[bookingId] — send a message
export async function POST(req: NextRequest, { params }: { params: { bookingId: string } }) {
  const authorized = await authorizeAccess(req, params.bookingId);
  if (!authorized) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  // Only admin can send as HOST, only guest (with token) can send as GUEST
  const isAdmin = await isAdminAuthed();
  if (parsed.data.sender === "HOST" && !isAdmin) {
    return NextResponse.json({ error: "Not authorized to send as host" }, { status: 403 });
  }
  if (parsed.data.sender === "GUEST" && isAdmin) {
    // Admin trying to send as guest — not allowed, they should send as HOST
    return NextResponse.json({ error: "Send as HOST instead" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      bookingId: params.bookingId,
      sender: parsed.data.sender,
      text: parsed.data.text
    }
  });

  return NextResponse.json({ message });
}

// Checks if the request is from an admin or a guest with a valid messageToken
async function authorizeAccess(req: NextRequest, bookingId: string): Promise<boolean> {
  // Check admin auth first
  const isAdmin = await isAdminAuthed();
  if (isAdmin) return true;

  // Check guest token
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return false;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { messageToken: true }
  });

  return booking?.messageToken === token;
}
