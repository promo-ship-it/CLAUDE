import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials, createAdminSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const ok = await verifyAdminCredentials(parsed.data.email, parsed.data.password);
  if (!ok) return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });

  await createAdminSession();
  return NextResponse.json({ success: true });
}
