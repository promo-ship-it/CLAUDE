import { NextRequest, NextResponse } from "next/server";
import { runDepositJobs } from "@/lib/deposits";

// Daily maintenance: places, renews, and releases security deposit holds.
// On Vercel it's triggered by the cron in vercel.json. Vercel sends
// "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set. On other
// hosts, call GET /api/cron/daily once a day with the same header.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    console.error("[cron] CRON_SECRET is missing or shorter than 16 characters — job not run.");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const deposits = await runDepositJobs();
  if (deposits.errors.length) console.error("[cron] deposit errors", deposits.errors);
  return NextResponse.json({ ok: true, deposits });
}
