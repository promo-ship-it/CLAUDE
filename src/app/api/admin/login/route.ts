import { NextRequest, NextResponse } from "next/server";
import { subMinutes } from "date-fns";
import { z } from "zod";
import { verifyAdminCredentials, createAdminSession } from "@/lib/auth";
import { getSessionSecret } from "@/lib/session-secret";
import { prisma } from "@/lib/prisma";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  if (!getSessionSecret()) {
    return NextResponse.json(
      { error: "Admin login is disabled: SESSION_SECRET is not set (needs 32+ characters)." },
      { status: 500 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const ip = clientIp(req);
  const since = subMinutes(new Date(), WINDOW_MINUTES);
  const recentFailures = await prisma.loginAttempt.count({ where: { ip, createdAt: { gte: since } } });
  if (recentFailures >= MAX_FAILURES) {
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${WINDOW_MINUTES} minutes.` },
      { status: 429 }
    );
  }

  const ok = await verifyAdminCredentials(parsed.data.email, parsed.data.password);
  if (!ok) {
    await prisma.loginAttempt.create({ data: { ip } });
    // Keep the table small.
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: subMinutes(new Date(), 24 * 60) } } }).catch(() => {});
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  await prisma.loginAttempt.deleteMany({ where: { ip } }).catch(() => {});
  await createAdminSession();
  return NextResponse.json({ success: true });
}
